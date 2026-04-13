#!/usr/bin/env bash
# Deploy the latest image to a droplet running Docker Compose.
#
# Usage: ./deploy.sh user@host
#
# Prerequisites on the droplet:
#   - Docker + Docker Compose plugin installed
#   - ~/glaze/docker-compose.yml present (bootstrapped once; kept in sync by this script)
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

echo "--- syncing docker-compose.yml to image commit ---"
SHA=$(docker inspect ghcr.io/shaoster/glaze:latest \
    --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
if [[ -z "$SHA" ]]; then
    echo "WARNING: image has no revision label, docker-compose.yml not updated"
else
    echo "Image built from commit $SHA"
    curl -fsSL \
        "https://raw.githubusercontent.com/shaoster/glaze/${SHA}/docker-compose.yml" \
        -o docker-compose.yml
fi

echo "--- restarting services ---"
# Migrations run automatically in docker-entrypoint.sh on container start.
docker compose up -d

echo "--- pruning stopped containers and unused images ---"
# Remove stopped containers (old versions) so their images become reclaimable.
docker container prune -f
# Remove dangling images (old pulled layers no longer tagged or referenced).
docker image prune -f

echo "--- deploy complete ---"
docker compose ps
REMOTE
