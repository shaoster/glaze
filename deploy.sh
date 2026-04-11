#!/usr/bin/env bash
# Deploy the latest code to a droplet running Docker Compose.
#
# Usage: ./deploy.sh user@host
#
# Prerequisites on the droplet:
#   - Docker + Docker Compose plugin installed
#   - Repo cloned at ~/glaze
#   - .env file present at ~/glaze/.env (copy from .env.production.example)
set -euo pipefail

HOST=${1:?Usage: ./deploy.sh user@host}

ssh "$HOST" bash <<'REMOTE'
set -euo pipefail
cd ~/glaze

echo "--- pulling latest code ---"
git pull

echo "--- building image ---"
docker compose build

echo "--- starting services ---"
# --no-deps so we don't restart the db unnecessarily
docker compose up -d --no-deps web db

echo "--- waiting for db to be healthy ---"
docker compose run --rm web python manage.py migrate --no-input

echo "--- restarting web to pick up new image ---"
docker compose restart web

echo "--- deploy complete ---"
docker compose ps
REMOTE
