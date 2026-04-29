#!/bin/bash
set -e

python manage.py migrate --no-input
python manage.py collectstatic --no-input
python manage.py load_public_library --skip-if-missing

exec python -m gunicorn backend.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 1 \
    --timeout 120
