import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, Optional, Protocol

from celery import shared_task
from celery.signals import task_failure
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
    _time_limits: Dict[str, int] = {}

    @classmethod
    def register(cls, name: str, time_limit: Optional[int] = None):
        def wrapper(func: TaskCallable):
            cls._tasks[name] = func
            if time_limit is not None:
                cls._time_limits[name] = time_limit
            return func

        return wrapper

    @classmethod
    def get(cls, name: str) -> Optional[TaskCallable]:
        return cls._tasks.get(name)

    @classmethod
    def get_time_limit(cls, name: str) -> Optional[int]:
        return cls._time_limits.get(name)


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
            except BaseException as e:
                logger.exception(
                    f"Fatal error executing task {task.task_type} ({task.id})"
                )
                task.status = AsyncTask.Status.FAILURE
                task.error = str(e)
                task.save(update_fields=["status", "error", "last_modified"])
                from celery.exceptions import SoftTimeLimitExceeded, TimeLimitExceeded

                if not isinstance(e, Exception) or isinstance(
                    e, (SoftTimeLimitExceeded, TimeLimitExceeded)
                ):
                    raise
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
        soft_limit = TaskRegistry.get_time_limit(task.task_type)
        kwargs: Dict[str, Any] = {}
        if soft_limit is not None:
            kwargs["soft_time_limit"] = soft_limit
            kwargs["time_limit"] = soft_limit + 30
        task_id = task.id
        transaction.on_commit(
            lambda: run_celery_task.apply_async(args=[task_id], **kwargs)
        )


@shared_task
def run_celery_task(task_id: Any) -> None:
    """Celery worker entrypoint for all AsyncTasks."""
    _execute_task(task_id)


@task_failure.connect
def handle_task_failure(
    sender=None,
    task_id=None,
    exception=None,
    args=None,
    kwargs=None,
    **kwargs_extra,
) -> None:
    """Fallback handler to mark AsyncTask as failed if Celery worker crashes, times out, or fails."""
    if sender and sender.name == "api.tasks.run_celery_task" and args:
        db_task_id = args[0]
        try:
            close_old_connections()
            task = AsyncTask.objects.get(id=db_task_id)
            if task.status != AsyncTask.Status.FAILURE:
                logger.error(
                    f"Celery task failure signal triggered for task {db_task_id}. "
                    f"Updating AsyncTask status to FAILURE. Exception: {exception}"
                )
                task.status = AsyncTask.Status.FAILURE
                task.error = f"Celery task execution failed: {exception}"
                task.save(update_fields=["status", "error", "last_modified"])
        except Exception:
            logger.exception(
                f"Failed to update AsyncTask status on Celery task failure for {db_task_id}"
            )


# Global interface instance.
def _modal_function(app_name: str, fn_name: str) -> Any:
    """Thin wrapper around modal.Function.from_name — mock this in tests."""
    import modal  # noqa: PLC0415

    return modal.Function.from_name(app_name, fn_name)


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

    if not image.url:
        return {"status": "skipped", "reason": "Image has no URL"}

    logger.info("Offloading subject detection to remote service.")
    crop_run = run_crop_inference(piece_state_image, async_task=task)
    if crop_run.status != CropRun.Status.SUCCESS:
        return {"status": "skipped", "reason": crop_run.error or crop_run.status}
    crop = crop_run.crop

    psi_skip_reason = None
    if piece_state_image is not None:
        with transaction.atomic():
            psi = (
                PieceStateImage.objects.select_for_update()
                .select_related("image", "piece_state__piece")
                .get(id=piece_state_image.id)
            )
            if psi.crop is None:
                from .crops import apply_crop

                apply_crop(psi, crop)
                return {"status": "success", "crop": psi.crop, "updated": True}
            else:
                psi_skip_reason = "PieceStateImage already has a crop"
                logger.warning(
                    f"detect_subject_crop skipped psi={psi.id}: crop already set by user, not overwriting"
                )
    return {
        "status": "skipped",
        "reason": psi_skip_reason or "No crop targets were updated",
    }


@TaskRegistry.register("generate_cropped_image", time_limit=120)
def generate_cropped_image(task: AsyncTask) -> dict:
    """Materialize a PieceStateImage crop as an eager JPEG derivative in R2.

    Input is the value pair ``(image_id, crop coords)`` — never a PSI pk —
    so completion can update every current row matching the pair even if the
    triggering row was deleted and recreated while the task ran.

    Heavy compute (PIL crop) is offloaded to Modal. Celery owns all DB reads
    and writes; Modal receives public URLs and presigned PUT URLs only — no
    bytes transit the Celery↔Modal boundary.
    """
    from . import r2
    from .crops import crop_key_for, set_cropped_fields
    from .models import Image
    from .utils import crop_to_dict

    params = task.input_params or {}
    image_id = params.get("image_id")
    crop = crop_to_dict(params.get("crop"))
    if not image_id:
        raise ValueError("Missing image_id in task params")
    if crop is None:
        raise ValueError("Missing or invalid crop in task params")

    try:
        image = Image.objects.get(id=image_id)
    except Image.DoesNotExist:
        return {"status": "skipped", "reason": f"Image {image_id} not found"}

    if not image.r2_key:
        return {"status": "skipped", "reason": "Image is not stored in R2"}
    if not r2.is_r2_configured():
        return {"status": "skipped", "reason": "R2 object storage is not configured"}

    key = crop_key_for(image.r2_key, crop)
    url = r2.public_url_for_key(key)

    if r2.object_exists(key):
        updated = set_cropped_fields(image, crop, r2_key=key, url=url)
        return {
            "status": "success",
            "cropped_url": url,
            "updated_links": updated,
            "reused_existing_object": True,
        }

    presigned_put = r2.generate_presigned_put(key, "image/jpeg")
    crop_image_fn = _modal_function("glaze-compute", "crop_image")
    asyncio.run(crop_image_fn.remote.aio(r2.public_url_for_key(image.r2_key), crop, presigned_put))
    updated = set_cropped_fields(image, crop, r2_key=key, url=url)
    return {
        "status": "success",
        "cropped_url": url,
        "updated_links": updated,
        "reused_existing_object": False,
    }


@TaskRegistry.register("convert_image_to_jpeg", time_limit=120)
def convert_image_to_jpeg(task: AsyncTask) -> dict:
    """Convert an R2-hosted image to a JPEG derivative at a new key.

    Triggered immediately after a presigned-PUT upload for any non-JPEG image
    (PNG, WebP, HEIC/HEIF, AVIF, GIF). After conversion the original object is
    kept in R2 for provenance and the Image model row is updated to the JPEG URL.

    Input params:
        key        R2 key of the uploaded source image.
        image_id   UUID of the Image row to rewrite after conversion.

    Returns ``url``, ``key``, ``width``, and ``height`` of the new JPEG.

    Heavy compute (PIL decode/encode) is offloaded to Modal. Celery owns all
    DB reads and writes; Modal receives public URLs and a presigned PUT URL.
    """
    import uuid  # noqa: PLC0415

    from . import r2
    from .models import Image

    params = task.input_params or {}
    source_key: str | None = params.get("key")
    image_id: str | None = params.get("image_id")

    if not source_key:
        raise ValueError("Missing key in task params")
    if not r2.is_r2_configured():
        return {"status": "skipped", "reason": "R2 is not configured"}

    # Derive a stable JPEG key: same prefix/owner path, new UUID, .jpg extension.
    # e.g. images/42/abc.heic  →  images/42/<new-uuid>.jpg
    parts = source_key.rsplit("/", 1)
    owner_prefix = parts[0] if len(parts) == 2 else "images"
    new_key = f"{owner_prefix}/{uuid.uuid4()}.jpg"

    presigned_put = r2.generate_presigned_put(new_key, "image/jpeg")
    source_public_url = r2.public_url_for_key(source_key)

    convert_fn = _modal_function("glaze-compute", "convert_to_jpeg")
    result = asyncio.run(convert_fn.remote.aio(source_public_url, presigned_put))
    width: int = result["width"]
    height: int = result["height"]
    new_url = r2.public_url_for_key(new_key)

    # Source object is kept in R2 for provenance (GC handles cleanup later).

    # Ensure a source Image row exists so the lineage FK is meaningful, then
    # create a new JPEG Image row derived from it.
    if image_id:
        source_image = Image.objects.filter(id=image_id).first()
    else:
        source_image = None
    if source_image is None:
        source_image, _ = Image.objects.get_or_create(
            url=source_public_url,
            defaults={"r2_key": source_key, "user": task.user},
        )

    from .models import PieceStateImage  # noqa: PLC0415

    jpeg_image = Image.objects.create(
        url=new_url,
        r2_key=new_key,
        user=task.user,
        width=width,
        height=height,
        derived_from=source_image,
        derived_type="jpeg_conversion",
    )
    # Redirect any existing PSI rows that reference the HEIC/AVIF/non-JPEG
    # source to the new JPEG so they immediately serve a browser-renderable URL.
    PieceStateImage.objects.filter(image=source_image).update(image=jpeg_image)

    return {
        "status": "success",
        "url": new_url,
        "key": new_key,
        "width": width,
        "height": height,
        "source_key": source_key,
    }


@TaskRegistry.register("generate_showcase_video", time_limit=900)
def generate_showcase_video(task: AsyncTask) -> dict:
    """Render a deterministic Keepsake showcase video from a storyboard snapshot.

    Heavy compute (PyAV ffmpeg render) is offloaded to Modal via presigned R2
    PUT URL. Progress callbacks POST to /api/tasks/{id}/progress/ using an
    HMAC token so Modal never holds Django session credentials.
    """
    from django.conf import settings

    from .showcase import (
        SHOWCASE_VIDEO_RENDER_VERSION,
        compute_storyboard_hash,
        is_showcase_video_storage_enabled,
        validate_storyboard,
    )
    from .showcase.music import get_track
    from .showcase.render import showcase_video_key
    from . import r2
    from .task_views import _make_progress_token

    params = task.input_params or {}
    if not isinstance(params, dict):
        raise ValueError("Missing task input params")

    storyboard = params.get("storyboard")
    if not isinstance(storyboard, dict):
        raise ValueError("Missing storyboard snapshot in task params")

    validate_storyboard(storyboard)

    stored_hash = params.get("input_hash")
    input_hash = stored_hash or compute_storyboard_hash(storyboard)

    if not is_showcase_video_storage_enabled():
        raise ValueError("Showcase video object storage is not configured.")

    key = showcase_video_key(input_hash)
    artifact_url = r2.public_url_for_key(key)

    if r2.object_exists(key):
        return {
            "status": "success",
            "render_version": SHOWCASE_VIDEO_RENDER_VERSION,
            "input_hash": input_hash,
            "artifact_filename": f"{input_hash}.mp4",
            "artifact_url": artifact_url,
            "download_url": artifact_url,
            "content_type": "video/mp4",
            "storyboard": storyboard,
        }

    task.progress = 0
    task.save(update_fields=["progress", "last_modified"])

    # Presigned PUT valid for 60 minutes — long enough for the largest renders.
    presigned_put = r2.generate_presigned_put(key, "video/mp4", expires=3600)
    progress_token = _make_progress_token(task.id)
    app_origin = getattr(settings, "_APP_ORIGIN", "")
    progress_webhook_url = f"{app_origin}/api/tasks/{task.id}/progress/"

    track = get_track(storyboard.get("music_track_id"))
    music_url = track.audio.url if track else None

    render_fn = _modal_function("glaze-compute", "render_showcase_video")
    asyncio.run(render_fn.remote.aio(storyboard, presigned_put, progress_webhook_url, progress_token, music_url))

    return {
        "status": "success",
        "render_version": SHOWCASE_VIDEO_RENDER_VERSION,
        "input_hash": input_hash,
        "artifact_filename": f"{input_hash}.mp4",
        "artifact_url": artifact_url,
        "download_url": artifact_url,
        "content_type": "video/mp4",
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
