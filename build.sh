#!/usr/bin/env bash
set -euo pipefail

# Install Python dependencies
pip install -r requirements.txt

# Build the React front-end so collectstatic can pick up web/dist
cd web
npm ci
npm run build
cd ..

# Collect Django static files (admin, DRF browsable API, etc.)
python manage.py collectstatic --no-input

# Apply database migrations
python manage.py migrate
