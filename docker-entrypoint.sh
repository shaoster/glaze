#!/bin/bash
set -e

python manage.py migrate --no-input
python manage.py load_public_library --skip-if-missing
# On startup, fail all tasks marked as RUNNING or PENDING because in an
# InMemoryTaskInterface setup, no tasks can survive a process restart.
#
# WARNING: this runs on EVERY container start. With multiple API instances
# behind nginx (#275/#273), instance B's restart would fail tasks that
# instance A is actively running. Move this out of per-instance startup
# (one-shot deploy job, advisory-lock-gated, or replace via shared broker)
# before the rolling-deploy work lands. See #437.
python manage.py clear_stuck_tasks --hours 0

exec python -m gunicorn backend.asgi:application \
    --bind 0.0.0.0:8000 \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 1 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --capture-output
