from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = "api"

    def ready(self):
        import os
        import sys

        # Only run cleanup when starting the actual web server (runserver or gunicorn/uvicorn).
        # This prevents failing tasks during migrations, shell, or other management commands.
        is_manage_py = os.path.basename(sys.argv[0]) == "manage.py"
        is_server_cmd = is_manage_py and ("runserver" in sys.argv or "runserver_plus" in sys.argv)
        is_prod_server = "gunicorn" in sys.argv[0] or "uvicorn" in sys.argv[0]

        if is_server_cmd or is_prod_server:
            from .tasks import fail_stuck_tasks

            try:
                # On startup, we can safely fail ALL tasks that are marked as RUNNING or PENDING
                # because in an InMemoryTaskInterface setup, no tasks can survive a process restart.
                fail_stuck_tasks(hours=0)
            except Exception:
                # Fail silently to avoid blocking startup if the database is not yet ready/migrated.
                pass
