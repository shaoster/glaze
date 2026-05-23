#!/usr/bin/env bash
# Ensures the k3s droplet is joined to the Tailscale tailnet with SSH enabled.
# Idempotent: installs Tailscale only if absent; `tailscale up` is a no-op if
# already authenticated with the same key.
#
# Usage: ensure_k3s_tailscale.sh [user@host] [tailscale-auth-key]
#
# user@host defaults to $GLAZE_PROD_HOST; auth-key defaults to $TAILSCALE_AUTH_KEY.
set -euo pipefail

HOST=${1:-${GLAZE_PROD_HOST:-}}
AUTH_KEY=${2:-${TAILSCALE_AUTH_KEY:-}}

if [[ -z "${HOST}" ]]; then
    echo "Usage: ensure_k3s_tailscale.sh [user@host] [tailscale-auth-key]" >&2
    echo "Set GLAZE_PROD_HOST in the environment to use the production droplet." >&2
    exit 1
fi

if [[ -z "${AUTH_KEY}" ]]; then
    echo "Usage: ensure_k3s_tailscale.sh [user@host] [tailscale-auth-key]" >&2
    echo "Set TAILSCALE_AUTH_KEY in the environment or pass it as the second argument." >&2
    exit 1
fi

ssh "${HOST}" bash <<REMOTE
set -euo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
    echo "==> Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
else
    echo "==> Tailscale already installed."
fi

echo "==> Ensuring tailnet membership (no-op if already up)..."
tailscale up --authkey="${AUTH_KEY}" --ssh

echo "==> Tailscale status:"
tailscale status --json | python3 -c "
import json, sys
node = json.load(sys.stdin)['Self']
print('  Hostname:', node['DNSName'].rstrip('.'))
print('  IP:      ', node['TailscaleIPs'][0])
"
REMOTE
