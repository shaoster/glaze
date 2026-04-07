#!/usr/bin/env bash
set -euo pipefail

# Install Python dependencies
pip install -r requirements.txt

# Generate TypeScript types from the live OpenAPI schema.
# Start Django in the background, wait for it to become ready, then stop it.
python manage.py runserver 8080 &
DJANGO_PID=$!
echo "Waiting for Django on :8080..."
for i in $(seq 1 30); do
    curl -sf http://localhost:8080/api/schema/ > /dev/null 2>&1 && break
    sleep 1
done
cd web
npm ci
npm run generate-types
cd ..
kill "$DJANGO_PID"
wait "$DJANGO_PID" 2>/dev/null || true

# Build the React front-end so collectstatic can pick up web/dist
cd web
npm run build
cd ..

# Collect Django static files (admin, DRF browsable API, etc.)
python manage.py collectstatic --no-input

# Apply database migrations
python manage.py migrate

# Create superuser non-interactively
if [[ $CREATE_SUPERUSER ]]; then
  python manage.py createsuperuser --no-input
fi