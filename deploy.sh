#!/usr/bin/env bash
# Deploy the latest image to a droplet running Docker Compose.
#
# Usage: ./deploy.sh user@host
#
# Prerequisites on the droplet:
#   - Docker + Docker Compose plugin installed
#   - ~/glaze/docker-compose.yml present
#   - ~/glaze/.env present (copy from .env.production.example)
#   - Authenticated with ghcr.io (one-time):
#       docker login ghcr.io -u shaoster -p <PAT with read:packages>
set -euo pipefail

HOST=${1:?Usage: ./deploy.sh user@host}

ssh "$HOST" bash <<'REMOTE'
set -euo pipefail
cd ~/glaze

echo "--- pulling latest image ---"
docker compose pull

echo "--- restarting services ---"
# Migrations run automatically in docker-entrypoint.sh on container start.
docker compose up -d

echo "--- deploy complete ---"
docker compose ps
REMOTE
