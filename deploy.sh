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
docker compose --profile production pull

echo "--- rolling deploy: web ---"
# Phase 1: start a second replica with the new image alongside the old one.
docker compose --profile production up -d --no-recreate --scale web=2
# Wait until both replicas are healthy before touching the old one.
echo "  waiting for 2 healthy web replicas..."
for i in $(seq 1 20); do
    healthy=$(docker compose ps --format json | python3 -c "
import sys, json
containers = [json.loads(l) for l in sys.stdin if l.strip()]
web = [c for c in containers if c.get('Service') == 'web']
print(sum(1 for c in web if c.get('Health') == 'healthy'))
" 2>/dev/null || echo 0)
    if [[ "$healthy" -ge 2 ]]; then
        echo "  both replicas healthy"
        break
    fi
    echo "  $healthy/2 healthy ($i/20)"
    sleep 15
done
# Phase 2: recreate the stale first replica (new-image replica serves traffic).
docker compose --profile production up -d --scale web=2
echo "  waiting for 2 healthy web replicas after recreation..."
for i in $(seq 1 20); do
    healthy=$(docker compose ps --format json | python3 -c "
import sys, json
containers = [json.loads(l) for l in sys.stdin if l.strip()]
web = [c for c in containers if c.get('Service') == 'web']
print(sum(1 for c in web if c.get('Health') == 'healthy'))
" 2>/dev/null || echo 0)
    if [[ "$healthy" -ge 2 ]]; then
        echo "  both replicas healthy"
        break
    fi
    echo "  $healthy/2 healthy ($i/20)"
    sleep 15
done
# Phase 3: scale back to 1 steady-state replica.
docker compose --profile production up -d --scale web=1
echo "  scaled back to 1 replica"

echo "--- restarting other services ---"
# --force-recreate picks up .env changes (e.g. secret rotation) for non-web services.
docker compose --profile production up -d --force-recreate --no-deps worker nginx otelcol

echo "--- pruning ---"
docker container prune -f
docker image prune -f

echo "--- deploy complete ---"
docker compose --profile production ps
REMOTE

# Sync certbot renewal hooks so cert reload behavior stays in version control.
echo "--- syncing certbot renewal hooks ---"
ssh "$HOST" "mkdir -p /etc/letsencrypt/renewal-hooks/deploy"
scp certbot/renewal-hooks/deploy/01-glaze-nginx-reload.sh \
    "$HOST":/etc/letsencrypt/renewal-hooks/deploy/01-glaze-nginx-reload.sh
ssh "$HOST" "chmod +x /etc/letsencrypt/renewal-hooks/deploy/01-glaze-nginx-reload.sh"
