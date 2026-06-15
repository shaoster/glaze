from django.apps import AppConfig


def _fail_running_tasks_on_startup() -> int:
    """Mark every RUNNING or PENDING AsyncTask as FAILURE.

    Called on web server startup so tasks stranded by a pod restart don't block
    the frontend spinner forever. PENDING tasks are also stranded because the
    in-memory thread pool they were submitted to no longer exists. Returns the
    count of tasks updated.
    """
    from .models import AsyncTask

    return AsyncTask.objects.filter(
        status__in=[AsyncTask.Status.RUNNING, AsyncTask.Status.PENDING]
    ).update(
        status=AsyncTask.Status.FAILURE,
        error="Server restarted while task was pending or running.",
    )


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

            # We are running under a server's event loop (e.g. uvicorn).
            # Temporarily allow async unsafe database access for startup initialization.
            was_unsafe = os.environ.get("DJANGO_ALLOW_ASYNC_UNSAFE")
            os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
            try:
                _fail_running_tasks_on_startup()
            finally:
                if was_unsafe is None:
                    os.environ.pop("DJANGO_ALLOW_ASYNC_UNSAFE", None)
                else:
                    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = was_unsafe
