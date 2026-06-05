#!/bin/bash
set -e

# Keep the container startup conventional. If we ever need more elaborate
# dispatch again, we can move the logic back into Python without changing the
# hermetic dependency layer.
if [ $# -gt 0 ]; then
    case "$1" in
        python|python3|/usr/bin/python|/usr/bin/python3)
            exec "$@"
            ;;
        celery)
            shift 1
            exec python -m celery "$@"
            ;;
        *)
            exec "$@"
            ;;
    esac
fi

exec python -m gunicorn backend.asgi:application \
    --bind 0.0.0.0:8000 \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 1 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --capture-output
