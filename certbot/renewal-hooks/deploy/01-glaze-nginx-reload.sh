#!/usr/bin/env bash
# Certbot deploy hook: reload the nginx container after cert renewal.
# Tracked in version control and synced to /etc/letsencrypt/renewal-hooks/deploy/
# by deploy.sh on every release.
set -euo pipefail

CONTAINER=$(docker ps --filter "name=nginx" --format "{{.Names}}" | head -1)
if [[ -z "$CONTAINER" ]]; then
    echo "nginx container not running, skipping reload"
    exit 0
fi
docker exec "$CONTAINER" nginx -s reload
