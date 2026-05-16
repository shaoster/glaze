#!/usr/bin/env bash
# Deploy the latest image to a droplet running Docker Compose.
#
# Usage: ./deploy.sh user@host [commit-sha]
#
# commit-sha: the SHA to sync docker-compose.yml from. When omitted, the
#             script reads org.opencontainers.image.revision from the image
#             label (CI path). gz_deploy passes it explicitly (local path).
#
# Prerequisites on the droplet:
#   - Docker + Docker Compose plugin installed
#   - ~/glaze/.env present (copy from .env.production.example)
#   - Authenticated with ghcr.io (one-time):
#       docker login ghcr.io -u shaoster -p <PAT with read:packages>
#
# On first run this script clones the repo to ~/glaze (public repo, no key needed).
# Subsequent deploys fetch the commit matching the deployed image so config files
# (docker-compose.yml, otel-collector-config.yml, nginx/snippets/, etc.) are
# always in sync without having to update this script when new files are added.
set -euo pipefail

HOST=${1:?Usage: ./deploy.sh user@host [commit-sha]}
KNOWN_SHA=${2:-}

echo "--- deploying application ---"
ssh "$HOST" bash <<REMOTE
set -euo pipefail

echo "--- bootstrapping repo (no-op if already cloned) ---"
if [[ ! -d ~/glaze/.git ]]; then
    git clone https://github.com/shaoster/glaze.git ~/glaze
fi
cd ~/glaze

echo "--- pulling latest images ---"
docker compose pull

echo "--- syncing repo to image commit ---"
SHA="${KNOWN_SHA}"
if [[ -z "\$SHA" ]]; then
    SHA=\$(docker inspect ghcr.io/shaoster/glaze:latest \
        --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)
fi
if [[ -z "\$SHA" ]]; then
    echo "WARNING: commit SHA unknown, repo not updated"
else
    echo "Image built from commit \$SHA"
    git fetch --quiet origin
    git checkout --quiet "\$SHA"
fi

echo "--- restarting services ---"
docker compose up -d

echo "--- pruning ---"
docker container prune -f
docker image prune -f

echo "--- deploy complete ---"
docker compose ps
REMOTE

# Nginx snippets are synced after a successful app deploy so a mid-deploy
# failure does not leave new config files on the host without a reload.
echo "--- syncing Nginx snippets ---"
ssh "$HOST" "mkdir -p /etc/nginx/snippets"
scp -r nginx/snippets/*.conf "$HOST":/etc/nginx/snippets/
ssh "$HOST" "nginx -t && systemctl reload nginx"
