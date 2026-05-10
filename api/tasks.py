import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, Optional, Protocol

from django.db import transaction

from .models import AsyncTask

logger = logging.getLogger(__name__)

# Single shared executor for background tasks in development.
_executor = ThreadPoolExecutor(max_workers=4)

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
        transaction.on_commit(lambda: _executor.submit(self._run_task, task.id))

    def _run_task(self, task_id: Any) -> None:
        # Re-fetch task to ensure we have the latest state in this thread.
        try:
            task = AsyncTask.objects.get(id=task_id)
        except AsyncTask.DoesNotExist:
            logger.error(f"Async task {task_id} not found for execution.")
            return

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
        except Exception as e:
            logger.exception(f"Error executing task {task.task_type} ({task.id})")
            task.status = AsyncTask.Status.FAILURE
            task.error = str(e)
            task.save(update_fields=["status", "error", "last_modified"])


# Global interface instance.
# In the future, this can be swapped for CeleryTaskInterface based on settings.
get_task_interface: Callable[[], TaskInterface] = lambda: InMemoryTaskInterface()


@TaskRegistry.register("ping")
def ping_task(task: AsyncTask) -> Dict[str, str]:
    """A simple demonstrator task that returns a pong result."""
    import time

    # Simulate some work.
    time.sleep(1)
    return {"message": "pong", "input": task.input_params}
