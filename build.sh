#!/usr/bin/env bash
set -euo pipefail

trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Install Python dependencies
pip install -r requirements.txt

# Generate TypeScript types from the live OpenAPI schema.
# Start Django in the background, wait for it to become ready, then stop it.
PORT=$(
  ss -tln | 
  awk 'NR > 1{gsub(/.*:/,"",$4); print $4}' |
  sort -un |
  awk -v n=8080 '$0 < n {next}; $0 == n {n++; next}; {exit}; END {print n}'
)
python manage.py runserver $PORT &
DJANGO_PID=$!
echo "Waiting for Django on :$PORT..."
for i in $(seq 1 30); do
    curl -sf http://localhost:$PORT/api/schema/ > /dev/null 2>&1 && break
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