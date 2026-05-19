#!/bin/bash
set -e

exec python -m gunicorn backend.asgi:application \
    --bind 0.0.0.0:8000 \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 1 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --capture-output
