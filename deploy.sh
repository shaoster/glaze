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
#   - SSL certificates provisioned (one-time): run setup-nginx.sh
#
# On first run this script clones the repo to ~/glaze (public repo, no key needed).
# Subsequent deploys fetch the commit matching the deployed image, persist that
# tag in ~/glaze/.env, and then restart Compose so later restarts keep using the
# exact release image instead of drifting to a moving tag.
set -euo pipefail

HOST=${1:?Usage: ./deploy.sh user@host commit-sha}
KNOWN_SHA=${2:?Usage: ./deploy.sh user@host commit-sha}

echo "--- deploying application ---"
ssh "$HOST" env KNOWN_SHA="$KNOWN_SHA" bash <<'REMOTE'
set -euo pipefail

echo "--- bootstrapping repo (no-op if already cloned) ---"
if [[ ! -d ~/glaze/.git ]]; then
    git clone https://github.com/shaoster/glaze.git ~/glaze
fi
cd ~/glaze

echo "--- syncing repo to image commit ---"
SHA="$KNOWN_SHA"
echo "Image built from commit $SHA"
git fetch --quiet origin
git restore --quiet .
git checkout --quiet "$SHA"

echo "--- recording release tag in .env ---"
env_tmp=$(mktemp .env.tmp.XXXXXX)
trap 'rm -f "$env_tmp"' EXIT
if [[ -f .env ]]; then
    grep -v '^IMAGE_TAG=' .env > "$env_tmp" || true
fi
printf 'IMAGE_TAG=%s\n' "$SHA" >> "$env_tmp"
mv "$env_tmp" .env
trap - EXIT

echo "--- pulling release image ---"
docker compose pull

echo "--- restarting services ---"
# --force-recreate ensures containers always pick up .env changes even when
# the image and compose spec are unchanged (e.g. secret rotation).
# --profile production includes the nginx container (excluded from CI smoke tests).
docker compose --profile production up -d --force-recreate

echo "--- pruning ---"
docker container prune -f
docker image prune -f

echo "--- deploy complete ---"
docker compose --profile production ps
REMOTE
