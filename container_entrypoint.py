"""Hermetic production entrypoint for the Django OCI image."""

from __future__ import annotations

import os
import sys

from django.core.management import execute_from_command_line
from celery.__main__ import main as celery_main
from gunicorn.app.wsgiapp import run as gunicorn_run

_GUNICORN_ARGS = [
    "gunicorn",
    "backend.asgi:application",
    "--bind",
    "0.0.0.0:8000",
    "--worker-class",
    "uvicorn.workers.UvicornWorker",
    "--workers",
    "1",
    "--timeout",
    "120",
    "--access-logfile",
    "-",
    "--error-logfile",
    "-",
    "--capture-output",
]


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
    if len(sys.argv) > 1:
        if sys.argv[1] == "celery":
            sys.argv = ["celery", *sys.argv[2:]]
            celery_main()
            return
        execute_from_command_line(["manage.py", *sys.argv[1:]])
        return
    sys.argv = _GUNICORN_ARGS
    gunicorn_run()


if __name__ == "__main__":
    main()
