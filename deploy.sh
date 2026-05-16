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
#   - ~/glaze/docker-compose.yml present (bootstrapped once; kept in sync by this script)
#   - ~/glaze/.env present (copy from .env.production.example)
#   - Authenticated with ghcr.io (one-time):
#       docker login ghcr.io -u shaoster -p <PAT with read:packages>
set -euo pipefail

HOST=${1:?Usage: ./deploy.sh user@host [commit-sha]}
KNOWN_SHA=${2:-}

echo "--- deploying application ---"
ssh "$HOST" bash <<REMOTE
set -euo pipefail
cd ~/glaze

echo "--- pulling latest images ---"
docker compose pull

echo "--- syncing docker-compose.yml ---"
SHA="${KNOWN_SHA}"
if [[ -z "\$SHA" ]]; then
    SHA=\$(docker inspect ghcr.io/shaoster/glaze:latest \
        --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)
fi
if [[ -z "\$SHA" ]]; then
    echo "WARNING: commit SHA unknown, docker-compose.yml not updated"
else
    echo "Image built from commit \$SHA"
    curl -fsSL \
        "https://raw.githubusercontent.com/shaoster/glaze/\${SHA}/docker-compose.yml" \
        -o docker-compose.yml
    curl -fsSL \
        "https://raw.githubusercontent.com/shaoster/glaze/\${SHA}/otel-collector-config.yml" \
        -o otel-collector-config.yml
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
