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
SSH_OPTS=(
    -o ConnectTimeout=30
    -o ServerAliveInterval=60
    -o ServerAliveCountMax=10
    -o TCPKeepAlive=yes
)

echo "--- deploying application ---"
ssh "${SSH_OPTS[@]}" "$HOST" env KNOWN_SHA="$KNOWN_SHA" bash <<'REMOTE'
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

echo "--- running deploy bootstrap ---"
# Run the one-shot bootstrap against the new image before we move traffic.
# This keeps migrations and public-library refreshes tied to each release
# while still leaving deploy_init as a completion-gated service.
docker compose --profile production up --no-deps deploy_init

echo "--- rolling deploy: web ---"
# Step 1: Record the ID of the current (old) container.
OLD_CONTAINER_ID=$(docker compose --profile production ps -q web | head -n 1)

# Step 2: Spin up a second instance with the NEW image.
# --no-recreate is crucial: it keeps the old container running while starting the new one.
echo "  starting new web instance..."
docker compose --profile production up -d --no-recreate --no-deps --scale web=2

# Step 3: Wait for the NEW instance to be healthy.
# We look for at least 2 healthy instances (the old one should already be healthy).
echo "  waiting for new instance to pass health checks..."
for i in $(seq 1 30); do
    healthy=$(docker compose ps --format json | python3 -c "
import sys, json
raw = sys.stdin.read().strip()
if not raw:
    print(0); sys.exit()
try:
    data = json.loads(raw)
    containers = data if isinstance(data, list) else [data]
except:
    containers = [json.loads(l) for l in raw.splitlines() if l.strip()]
web_healthy = [c for c in containers if (c.get('Service') == 'web' or c.get('service') == 'web') and (c.get('Health') == 'healthy' or c.get('health') == 'healthy')]
print(len(web_healthy))
" 2>/dev/null || echo 0)
    if [[ "$healthy" -ge 2 ]]; then
        echo "  new instance is healthy"
        break
    fi
    echo "  waiting... ($i/30)"
    sleep 10
done

# Step 4: Reload Nginx. 
# It will now round-robin between the old (healthy) and new (healthy) container.
echo "  reloading nginx (traffic now shared)..."
docker compose --profile production exec -T nginx nginx -s reload

# Step 5: Remove the OLD container only.
# By stopping and removing the specific container ID we recorded earlier, 
# we leave the new healthy one serving traffic.
if [[ -n "$OLD_CONTAINER_ID" ]]; then
    echo "  removing old instance ($OLD_CONTAINER_ID)..."
    docker stop "$OLD_CONTAINER_ID" >/dev/null
    docker rm "$OLD_CONTAINER_ID" >/dev/null
fi

# Step 6: Finalize state.
# 'up -d --scale web=1' will now see one healthy container and do nothing to it,
# effectively promoting it to the primary instance.
docker compose --profile production up -d --scale web=1
echo "  scaled back to 1 instance"

# Step 7: Final Nginx reload to stop routing to the now-deleted old IP.
docker compose --profile production exec -T nginx nginx -s reload

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
ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p /etc/letsencrypt/renewal-hooks/deploy"
scp "${SSH_OPTS[@]}" certbot/renewal-hooks/deploy/01-glaze-nginx-reload.sh \
    "$HOST":/etc/letsencrypt/renewal-hooks/deploy/01-glaze-nginx-reload.sh
ssh "${SSH_OPTS[@]}" "$HOST" "chmod +x /etc/letsencrypt/renewal-hooks/deploy/01-glaze-nginx-reload.sh"
