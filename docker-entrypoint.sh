#!/bin/bash
set -e

# If arguments are passed to the entrypoint, execute them instead of starting gunicorn
if [ $# -gt 0 ]; then
    exec "$@"
fi

exec python -m gunicorn backend.asgi:application \
    --bind 0.0.0.0:8000 \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 1 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --capture-output
