#!/usr/bin/env bash
# Initializes .env.local for local development against the production cluster.
#
# If .env.local does not exist, copies .env.example as a starting point.
# Then pulls the subset of glaze-secrets that are useful for local development
# (R2, Google OAuth) and writes them into a clearly-delimited managed
# block in .env.local. Existing values outside that block are preserved, and
# the script is safe to re-run.
#
# Requires Tailscale — SSH to the cluster is tailnet-only. Your machine must
# be connected to Tailscale and tagged as an admin-client.
#
# Usage: tools/init_env.sh [deploy_host]
#   deploy_host  defaults to $GLAZE_PROD_HOST, then root@glaze-prod
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="$REPO_ROOT/.env.local"
PROD_HOST="${1:-${GLAZE_PROD_HOST:-root@glaze-prod}}"
SSH="ssh -o StrictHostKeyChecking=no"

# Keys to pull from glaze-secrets into .env.local.
# Intentionally excludes prod-only keys: SECRET_KEY, POSTGRES_PASSWORD,
# CLOUDFLARE_API_TOKEN, TAILSCALE_*, GRAFANA_*, ALLOWED_HOST, APP_ORIGIN,
# and DROPBOX_* (only used by the cluster backup job, not local dev).
KEYS="
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
"

# Create .env.local from template if it doesn't exist yet.
if [ ! -f "$ENV_LOCAL" ]; then
  echo "==> Creating .env.local from .env.example..."
  cp "$REPO_ROOT/.env.example" "$ENV_LOCAL"
fi

echo "==> Fetching service credentials from ${PROD_HOST}..."
FETCHED=$($SSH -o ConnectTimeout=10 "${PROD_HOST}" "
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  kubectl get secret glaze-secrets -n default -o json
" 2>/dev/null | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)['data']
keys = '''${KEYS}'''.split()
for k in keys:
    if k in data:
        print(f'{k}={base64.b64decode(data[k]).decode()}')
" 2>/dev/null || true)

if [ -z "$FETCHED" ]; then
  echo ""
  echo "Not added as an admin-client in tailnet. If you would like production access"
  echo "to potterdoc.com, install and run tailscale on your host and send a note to"
  echo "admin@potterdoc.com"
  echo ""
  echo "==> .env.local initialized from .env.example (no cluster credentials filled in)."
  exit 0
fi

# Replace the managed block (or append it if first run).
BLOCK_START="# --- fetched from cluster (managed by init_env.sh) ---"
BLOCK_END="# --- end fetched secrets ---"

if grep -qF "$BLOCK_START" "$ENV_LOCAL"; then
  # Remove the existing block.
  python3 - "$ENV_LOCAL" "$BLOCK_START" "$BLOCK_END" <<'PYEOF'
import sys
path, start, end = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).readlines()
out, inside = [], False
for line in lines:
    if line.strip() == start:
        inside = True
    if not inside:
        out.append(line)
    if line.strip() == end:
        inside = False
open(path, 'w').writelines(out)
PYEOF
fi

# Append the new block.
{
  echo ""
  echo "$BLOCK_START"
  echo "$FETCHED"
  echo "$BLOCK_END"
} >> "$ENV_LOCAL"

echo "==> Written to $ENV_LOCAL:"
echo "$FETCHED" | sed 's/=.*/=<redacted>/'
