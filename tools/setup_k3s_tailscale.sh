#!/usr/bin/env bash
# One-shot Tailscale bootstrap for the k3s droplet.
# Run this once to join the production droplet to the tailnet and enable
# Tailscale SSH. This does not install Nginx or configure any HTTP proxy.
#
# Usage: ./setup-k3s-tailscale.sh [user@host] [tailscale-auth-key]
#
# If omitted, `user@host` defaults to $GLAZE_PROD_HOST from the environment.
# If omitted, `tailscale-auth-key` defaults to $TAILSCALE_AUTH_KEY from the
# environment.
set -euo pipefail

HOST=${1:-${GLAZE_PROD_HOST:-}}
AUTH_KEY=${2:-${TAILSCALE_AUTH_KEY:-}}

if [[ -z "${HOST}" ]]; then
    echo "Usage: ./setup-k3s-tailscale.sh [user@host] [tailscale-auth-key]" >&2
    echo "Set GLAZE_PROD_HOST in the environment to use the production droplet." >&2
    exit 1
fi

if [[ -z "${AUTH_KEY}" ]]; then
    echo "Usage: ./setup-k3s-tailscale.sh [user@host] [tailscale-auth-key]" >&2
    echo "Set TAILSCALE_AUTH_KEY in the environment or pass it as the second argument." >&2
    exit 1
fi

ssh "${HOST}" bash <<REMOTE
set -euo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
    echo "--- installing Tailscale ---"
    curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "--- joining tailnet ---"
tailscale up --authkey="${AUTH_KEY}" --ssh

echo "--- tailnet status ---"
tailscale status --json | python3 -c "import json,sys; data=json.load(sys.stdin); self_node=data['Self']; print('Hostname: ' + self_node['DNSName'].rstrip('.')); print('Tailscale IP: ' + self_node['TailscaleIPs'][0])"

echo "--- done ---"
echo "Use the droplet's Tailscale IP or MagicDNS name for SSH and private browser access."
REMOTE
