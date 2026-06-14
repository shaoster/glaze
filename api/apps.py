from django.apps import AppConfig


def _fail_running_tasks_on_startup() -> int:
    """Mark every RUNNING AsyncTask as FAILURE.

    Called on web server startup so tasks stranded by a pod restart don't block
    the frontend spinner forever. Returns the count of tasks updated.
    """
    from .models import AsyncTask

    tasks = list(AsyncTask.objects.filter(status=AsyncTask.Status.RUNNING))
    for task in tasks:
        task.status = AsyncTask.Status.FAILURE
        task.error = "Server restarted while task was running."
        task.save(update_fields=["status", "error"])
    return len(tasks)


class ApiConfig(AppConfig):
    name = "api"

    def ready(self):
        import os
        import sys

        # Only run cleanup when starting the actual web server (runserver or gunicorn/uvicorn).
        # This prevents failing tasks during migrations, shell, or other management commands.
        is_manage_py = os.path.basename(sys.argv[0]) == "manage.py"
        is_server_cmd = is_manage_py and (
            "runserver" in sys.argv or "runserver_plus" in sys.argv
        )
        is_prod_server = "gunicorn" in sys.argv[0] or "uvicorn" in sys.argv[0]

        if is_server_cmd or is_prod_server:
            from .logging import setup_logging

            setup_logging()
            _fail_running_tasks_on_startup()
