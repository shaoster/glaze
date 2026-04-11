#!/usr/bin/env bash
# Stop all services on the production host.
#
# Usage: ./stop.sh user@host
set -euo pipefail

HOST=${1:?Usage: ./stop.sh user@host}

ssh "$HOST" bash <<'REMOTE'
set -euo pipefail
cd ~/glaze

echo "--- stopping services ---"
docker compose down

echo "--- done ---"
docker compose ps
REMOTE
