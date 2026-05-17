#!/usr/bin/env bash
# Deploy the image for a specific commit SHA to a droplet running Docker Compose.
#
# Usage: ./deploy.sh user@host commit-sha
#
# commit-sha: required commit SHA for the published release/image tag.
#             gz_deploy passes it explicitly.
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

HOST=${1:?Usage: ./deploy.sh user@host commit-sha}
KNOWN_SHA=${2:?Usage: ./deploy.sh user@host commit-sha}

echo "--- deploying application ---"
ssh "$HOST" bash <<REMOTE
set -euo pipefail

echo "--- bootstrapping repo (no-op if already cloned) ---"
if [[ ! -d ~/glaze/.git ]]; then
    git clone https://github.com/shaoster/glaze.git ~/glaze
fi
cd ~/glaze

echo "--- syncing repo to image commit ---"
SHA="${KNOWN_SHA}"
echo "Image built from commit \$SHA"
git fetch --quiet origin
git restore --quiet .
git checkout --quiet "\$SHA"

echo "--- rendering release compose override ---"
cat > docker-compose.release.yml <<EOF
services:
  web:
    image: ghcr.io/shaoster/glaze:${SHA}
EOF

echo "--- pulling release image ---"
docker compose -f docker-compose.yml -f docker-compose.release.yml pull

echo "--- restarting services ---"
# --force-recreate ensures containers always pick up .env changes even when
# the image and compose spec are unchanged (e.g. secret rotation).
docker compose -f docker-compose.yml -f docker-compose.release.yml up -d --force-recreate

echo "--- pruning ---"
docker container prune -f
docker image prune -f

echo "--- deploy complete ---"
docker compose -f docker-compose.yml -f docker-compose.release.yml ps
rm -f docker-compose.release.yml
REMOTE

# Nginx snippets are synced after a successful app deploy so a mid-deploy
# failure does not leave new config files on the host without a reload.
echo "--- syncing Nginx snippets ---"
ssh "$HOST" "mkdir -p /etc/nginx/snippets"
scp -r nginx/snippets/*.conf "$HOST":/etc/nginx/snippets/
ssh "$HOST" "nginx -t && systemctl reload nginx"
