import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, Optional, Protocol

from celery import shared_task
from django.db import close_old_connections, transaction

from .models import AsyncTask

logger = logging.getLogger(__name__)

# Cache for the task interface instance.
_task_interface: Optional["TaskInterface"] = None

# Per-process executor for background tasks. AsyncTask state is DB-backed
# (so any API instance can poll status), but execution is bound to whichever
# instance accepted the submission — submitting via this executor on instance
# A means instance A is the only worker that will run it. A multi-instance
# topology must replace this with a shared-broker backend before #275 (nginx
# upstreams) lands; see #436.
_executor = ThreadPoolExecutor(max_workers=1)

TaskCallable = Callable[[AsyncTask], Any]


class TaskRegistry:
    """Registry for mapping task_type strings to Python functions."""

    _tasks: Dict[str, TaskCallable] = {}

    @classmethod
    def register(cls, name: str):
        def wrapper(func: TaskCallable):
            cls._tasks[name] = func
            return func

        return wrapper

    @classmethod
    def get(cls, name: str) -> Optional[TaskCallable]:
        return cls._tasks.get(name)


class TaskInterface(Protocol):
    """Protocol for submitting tasks to a background runner."""

    def submit(self, task: AsyncTask) -> None: ...

    def health_check(self) -> bool:
        """Return True if the task backend can currently accept submissions.

        Used by the readiness endpoint. Concrete implementations should make
        this cheap (no broker round-trip beyond what a real readiness probe
        warrants) and must not raise — return False on any unexpected state.
        """
        ...


def _execute_task(task_id: Any) -> None:
    """Shared execution logic for both in-memory and Celery workers."""
    from .logging import task_context

    with task_context(str(task_id)):
        # Close any stale connections before starting
        close_old_connections()

        try:
            # Re-fetch task to ensure we have the latest state in this thread.
            try:
                task = AsyncTask.objects.get(id=task_id)
            except AsyncTask.DoesNotExist:
                logger.error(f"Async task {task_id} not found for execution.")
                return

            from .utils import get_rss

            logger.info(
                f"Worker picking up task {task.task_type} ({task.id}). RSS: {get_rss():.2f}MB"
            )
            task.status = AsyncTask.Status.RUNNING
            task.save(update_fields=["status", "last_modified"])

            task_fn = TaskRegistry.get(task.task_type)
            if not task_fn:
                task.status = AsyncTask.Status.FAILURE
                task.error = f"Unknown task type: {task.task_type}"
                task.save(update_fields=["status", "error", "last_modified"])
                return

            try:
                result = task_fn(task)
                task.status = AsyncTask.Status.SUCCESS
                task.result = result
                task.save(update_fields=["status", "result", "last_modified"])
                from .utils import get_rss

                logger.info(
                    f"Successfully completed task {task.task_type} ({task.id}). RSS: {get_rss():.2f}MB"
                )
            except Exception as e:
                logger.exception(
                    f"Fatal error executing task {task.task_type} ({task.id})"
                )
                task.status = AsyncTask.Status.FAILURE
                task.error = str(e)
                task.save(update_fields=["status", "error", "last_modified"])
        finally:
            # Clean up connections so the thread pool doesn't leak them
            close_old_connections()


class InMemoryTaskInterface:
    """Runs tasks in a background thread pool."""

    def health_check(self) -> bool:
        # The shared executor is healthy iff it hasn't been shut down. After
        # shutdown, any subsequent .submit() raises RuntimeError, which would
        # surface to callers as a 500 — readiness should fail closed first.
        # Note: this check is per-process; a "ready" answer from instance A
        # says nothing about instance B's executor. Replacing this backend
        # with a shared broker (#436) is what makes the readiness signal
        # cluster-wide rather than instance-local.
        return not _executor._shutdown

    def submit(self, task: AsyncTask) -> None:
        # Use on_commit to ensure the task record is visible to the background thread.
        logger.info(f"Submitting task {task.task_type} ({task.id}) to thread pool.")
        transaction.on_commit(lambda: _executor.submit(_execute_task, task.id))


class CeleryTaskInterface:
    """Submits tasks to a Celery broker."""

    def __init__(self) -> None:
        from django.conf import settings
        from redis import Redis

        self._redis: Redis | None = (
            Redis.from_url(
                settings.CELERY_BROKER_URL,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            if settings.CELERY_BROKER_URL
            else None
        )

    def health_check(self) -> bool:
        if self._redis is None:
            return False
        try:
            # Assumes Redis broker; Celery doesn't provide a cheap generic
            # "broker_is_up" without a full connection/handshake.
            # NOTE: Update this if the broker ever changes away from Redis.
            return bool(self._redis.ping())
        except Exception:
            return False

    def submit(self, task: AsyncTask) -> None:
        logger.info(f"Submitting task {task.task_type} ({task.id}) to Celery.")
        transaction.on_commit(lambda: run_celery_task.delay(task.id))


@shared_task
def run_celery_task(task_id: Any) -> None:
    """Celery worker entrypoint for all AsyncTasks."""
    _execute_task(task_id)


# Global interface instance.
def get_task_interface() -> TaskInterface:
    global _task_interface
    if _task_interface is not None:
        return _task_interface

    from django.conf import settings

    backend = getattr(settings, "ASYNC_TASK_BACKEND", "inmemory")
    if backend == "celery":
        _task_interface = CeleryTaskInterface()
    else:
        _task_interface = InMemoryTaskInterface()
    return _task_interface


@TaskRegistry.register("ping")
def ping_task(task: AsyncTask) -> Dict[str, str]:
    """A simple demonstrator task that returns a pong result."""
    import time

    # Simulate some work.
    time.sleep(1)
    return {"message": "pong", "input": task.input_params}


@TaskRegistry.register("detect_subject_crop")
def detect_subject_crop(task: AsyncTask) -> dict | None:
    """Download an image, get a segmentation mask, derive crop, update targets."""
    from .models import CropRun, Image, PieceStateImage
    from .utils import run_crop_inference

    params = task.input_params or {}
    image_id = params.get("image_id")
    piece_id = params.get("piece_id")
    piece_state_image_id = params.get("piece_state_image_id")

    if not image_id:
        raise ValueError("Missing image_id in task params")

    logger.info(
        f"Processing detect_subject_crop for image {image_id} (piece={piece_id}, psi={piece_state_image_id})"
    )
    piece_state_image = None
    if piece_state_image_id:
        try:
            piece_state_image = PieceStateImage.objects.select_related(
                "image", "piece_state__piece"
            ).get(id=piece_state_image_id)
        except PieceStateImage.DoesNotExist:
            return {
                "status": "skipped",
                "reason": f"PieceStateImage {piece_state_image_id} not found",
            }
        image = piece_state_image.image
        if str(image.id) != str(image_id):
            return {
                "status": "skipped",
                "reason": (
                    f"PieceStateImage {piece_state_image_id} belongs to image {image.id}, "
                    f"not {image_id}"
                ),
            }
        if piece_id and str(piece_state_image.piece_state.piece_id) != str(piece_id):
            return {
                "status": "skipped",
                "reason": (
                    f"PieceStateImage {piece_state_image_id} belongs to piece "
                    f"{piece_state_image.piece_state.piece_id}, not {piece_id}"
                ),
            }
    elif piece_id:
        image = Image.objects.get(id=image_id)
        piece_state_image = (
            PieceStateImage.objects.select_related("image", "piece_state__piece")
            .filter(image=image, piece_state__piece_id=piece_id)
            .order_by("-piece_state__created", "-pk")
            .first()
        )
    else:
        image = Image.objects.get(id=image_id)
        piece_state_image = (
            PieceStateImage.objects.select_related("image", "piece_state__piece")
            .filter(image=image)
            .order_by("-piece_state__created", "-pk")
            .first()
        )

    if piece_state_image is None:
        return {
            "status": "skipped",
            "reason": f"No PieceStateImage found for image {image_id}",
        }

    # Cloudinary-backed assets only (as per constraints)
    if not image.cloud_name or not image.cloudinary_public_id:
        return {"status": "skipped", "reason": "Not a Cloudinary image"}

    logger.info("Offloading subject detection to remote service.")
    crop_run = run_crop_inference(piece_state_image, async_task=task)
    if crop_run.status != CropRun.Status.SUCCESS:
        return {"status": "skipped", "reason": crop_run.error or crop_run.status}
    crop = crop_run.crop

    psi_skip_reason = None
    if piece_state_image is not None:
        with transaction.atomic():
            psi = PieceStateImage.objects.select_for_update().get(
                id=piece_state_image.id
            )
            if psi.crop is None:
                psi.crop = crop
                psi.save(update_fields=["crop"])
                return {"status": "success", "crop": crop, "updated": True}
            else:
                psi_skip_reason = "PieceStateImage already has a crop"
                logger.warning(
                    f"detect_subject_crop skipped psi={psi.id}: crop already set by user, not overwriting"
                )
    return {
        "status": "skipped",
        "reason": psi_skip_reason or "No crop targets were updated",
    }


@TaskRegistry.register("generate_showcase_video")
def generate_showcase_video(task: AsyncTask) -> dict:
    """Render a deterministic Keepsake showcase video from a storyboard snapshot."""
    from .showcase import (
        SHOWCASE_VIDEO_RENDER_VERSION,
        compute_storyboard_hash,
        is_showcase_video_cloudinary_enabled,
        render_storyboard_to_mp4,
        upload_storyboard_video_to_cloudinary,
        validate_storyboard,
    )

    params = task.input_params or {}
    if not isinstance(params, dict):
        raise ValueError("Missing task input params")

    storyboard = params.get("storyboard")
    if not isinstance(storyboard, dict):
        raise ValueError("Missing storyboard snapshot in task params")

    validate_storyboard(storyboard)

    input_hash = compute_storyboard_hash(storyboard)
    stored_hash = params.get("input_hash")
    if stored_hash and str(stored_hash) != input_hash:
        raise ValueError("Storyboard snapshot hash does not match task input hash")

    if not is_showcase_video_cloudinary_enabled():
        raise ValueError("Cloudinary showcase video upload is not configured.")

    task.progress = 0
    task.save(update_fields=["progress", "last_modified"])

    def _report_progress(pct: int) -> None:
        task.progress = pct
        task.save(update_fields=["progress", "last_modified"])

    output_path = render_storyboard_to_mp4(storyboard, on_progress=_report_progress)
    try:
        cloudinary_asset = upload_storyboard_video_to_cloudinary(
            output_path,
            input_hash=input_hash,
        )
        if not cloudinary_asset:
            raise ValueError("Cloudinary showcase video upload failed.")
    except Exception:
        logger.exception(
            f"Cloudinary upload failed for showcase video task {task.id}; "
            "marking the task as failed."
        )
        raise
    finally:
        try:
            output_path.unlink(missing_ok=True)
        except OSError:
            logger.warning(
                "Could not remove temporary showcase video file for task %s",
                task.id,
            )

    return {
        "status": "success",
        "render_version": SHOWCASE_VIDEO_RENDER_VERSION,
        "input_hash": input_hash,
        "artifact_filename": f"{input_hash}.mp4",
        "artifact_url": cloudinary_asset["secure_url"],
        "download_url": cloudinary_asset["secure_url"],
        "content_type": "video/mp4",
        "cloudinary_asset": cloudinary_asset,
        "storyboard": storyboard,
    }


def fail_stuck_tasks(hours: int = 1) -> int:
    """Find and fail tasks stuck in RUNNING or PENDING for too long."""
    from datetime import timedelta

    from django.utils import timezone

    from .models import AsyncTask

    threshold = timezone.now() - timedelta(hours=hours)
    stuck_tasks = AsyncTask.objects.filter(
        status__in=[AsyncTask.Status.RUNNING, AsyncTask.Status.PENDING],
        last_modified__lt=threshold,
    )
    count = stuck_tasks.count()
    if count > 0:
        stuck_tasks.update(
            status=AsyncTask.Status.FAILURE,
            error="Task timed out or was orphaned during a server restart.",
            last_modified=timezone.now(),
        )
    return count
