import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, Optional, Protocol

from django.db import transaction

from .models import AsyncTask

logger = logging.getLogger(__name__)

# Single shared executor for background tasks in development.
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


class InMemoryTaskInterface:
    """Runs tasks in a background thread pool."""

    def submit(self, task: AsyncTask) -> None:
        # Use on_commit to ensure the task record is visible to the background thread.
        logger.info(f"Submitting task {task.task_type} ({task.id}) to thread pool.")
        transaction.on_commit(lambda: _executor.submit(self._run_task, task.id))

    def _run_task(self, task_id: Any) -> None:
        from django.db import close_old_connections

        # Close any stale connections before starting
        close_old_connections()

        try:
            # Re-fetch task to ensure we have the latest state in this thread.
            try:
                task = AsyncTask.objects.get(id=task_id)
            except AsyncTask.DoesNotExist:
                logger.error(f"Async task {task_id} not found for execution.")
                return

            logger.info(f"Worker picking up task {task.task_type} ({task.id}).")
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
                logger.info(
                    f"Successfully completed task {task.task_type} ({task.id})."
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


# Global interface instance.
# In the future, this can be swapped for CeleryTaskInterface based on settings.
def get_task_interface() -> TaskInterface:
    return InMemoryTaskInterface()


@TaskRegistry.register("ping")
def ping_task(task: AsyncTask) -> Dict[str, str]:
    """A simple demonstrator task that returns a pong result."""
    import time

    # Simulate some work.
    time.sleep(1)
    return {"message": "pong", "input": task.input_params}


@TaskRegistry.register("detect_subject_crop")
def detect_subject_crop(task: AsyncTask) -> dict | None:
    """Download an image, calculate its subject crop, and update the target model."""
    import requests
    from cloudinary import CloudinaryImage

    from .models import Image, Piece, PieceStateImage
    from .utils import calculate_subject_crop

    params = task.input_params or {}
    image_id = params.get("image_id")
    piece_id = params.get("piece_id")
    piece_state_image_id = params.get("piece_state_image_id")

    if not image_id:
        raise ValueError("Missing image_id in task params")

    logger.info(
        f"Processing detect_subject_crop for image {image_id} (piece={piece_id}, psi={piece_state_image_id})"
    )
    image = Image.objects.get(id=image_id)

    # Cloudinary-backed assets only (as per constraints)
    if not image.cloud_name or not image.cloudinary_public_id:
        return {"status": "skipped", "reason": "Not a Cloudinary image"}

    # Download image bytes. We request a JPG version from Cloudinary to ensure
    # compatibility with Pillow/rembg and reduce bandwidth for large raw uploads.
    download_url = CloudinaryImage(image.cloudinary_public_id).build_url(
        cloud_name=image.cloud_name,
        secure=True,
        format="jpg",
        quality="auto",
        width=1500,
        crop="limit",
    )
    logger.info(f"Downloading image from {download_url} (timeout=30s)")
    response = requests.get(download_url, timeout=30)
    response.raise_for_status()

    logger.info(f"Image downloaded ({len(response.content)} bytes). Starting rembg.")
    crop = calculate_subject_crop(response.content)
    if not crop:
        return {"status": "skipped", "reason": "No subject detected"}

    updated = False
    if piece_id:
        with transaction.atomic():
            piece = Piece.objects.select_for_update().get(id=piece_id)
            if piece.thumbnail_crop is None:
                piece.thumbnail_crop = crop
                piece.save(update_fields=["thumbnail_crop"])
                updated = True
            else:
                return {
                    "status": "skipped",
                    "reason": "Piece already has a thumbnail crop",
                }

    if piece_state_image_id:
        try:
            with transaction.atomic():
                psi = PieceStateImage.objects.select_for_update().get(
                    id=piece_state_image_id
                )
                if psi.crop is None:
                    psi.crop = crop
                    psi.save(update_fields=["crop"])
                    updated = True
                else:
                    return {
                        "status": "skipped",
                        "reason": "PieceStateImage already has a crop",
                    }
        except PieceStateImage.DoesNotExist:
            return {
                "status": "skipped",
                "reason": f"PieceStateImage {piece_state_image_id} not found",
            }

    return {"status": "success", "crop": crop, "updated": updated}


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
