#!/bin/bash
set -e

python manage.py migrate --no-input

exec python -m gunicorn backend.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 1 \
    --timeout 120
