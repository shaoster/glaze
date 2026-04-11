#!/usr/bin/env bash
# One-shot Tailscale + Nginx + SSL bootstrap for a fresh droplet.
# Run this once after the first `docker compose up -d`.
#
# Usage: ./setup-tailscale.sh user@host <tailscale-auth-key>
#
# The auth key can be a reusable or ephemeral key generated at:
#   https://login.tailscale.com/admin/settings/keys
#
# Before running this script:
#   1. Enable HTTPS certificates in the Tailscale admin console:
#      https://login.tailscale.com/admin/dns → enable "HTTPS Certificates"
#   2. Ensure MagicDNS is enabled (same page).
#
# What this script does:
#   1. Installs Tailscale and Nginx on the droplet
#   2. Authenticates the droplet to your Tailscale network
#   3. Issues a TLS cert for the droplet's *.ts.net hostname via `tailscale cert`
#   4. Installs the Nginx config with the Tailscale hostname and cert paths
#   5. Restricts ports 80/443 to the Tailscale subnet; closes port 8000
#   6. Installs a weekly cron job to renew the cert and reload Nginx
set -euo pipefail

HOST=${1:?Usage: ./setup-tailscale.sh user@host tailscale-auth-key}
AUTH_KEY=${2:?Usage: ./setup-tailscale.sh user@host tailscale-auth-key}

# Stream the Nginx template to the droplet; hostname substitution happens after
# Tailscale is up and we know the assigned hostname.
scp "$(dirname "$0")/nginx/glaze-tailscale.conf" "$HOST:/tmp/glaze-tailscale.conf"

ssh "$HOST" bash <<REMOTE
set -euo pipefail

echo "--- installing Tailscale ---"
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey="${AUTH_KEY}" --ssh

echo "--- getting Tailscale hostname ---"
TAILSCALE_HOSTNAME=\$(tailscale status --json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))")
echo "Tailscale hostname: \$TAILSCALE_HOSTNAME"

echo "--- issuing TLS certificate ---"
mkdir -p /etc/ssl/tailscale
tailscale cert \
    --cert-file /etc/ssl/tailscale/\${TAILSCALE_HOSTNAME}.crt \
    --key-file  /etc/ssl/tailscale/\${TAILSCALE_HOSTNAME}.key \
    "\$TAILSCALE_HOSTNAME"

echo "--- installing Nginx ---"
apt-get update -q
apt-get install -y -q nginx

echo "--- installing Nginx config ---"
sed "s/TAILSCALE_HOSTNAME/\${TAILSCALE_HOSTNAME}/g" /tmp/glaze-tailscale.conf \
    > /etc/nginx/sites-available/glaze
ln -sf /etc/nginx/sites-available/glaze /etc/nginx/sites-enabled/glaze
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

echo "--- configuring firewall ---"
ufw allow in on tailscale0 to any port 80
ufw allow in on tailscale0 to any port 443
ufw delete allow 8000 2>/dev/null || true
ufw delete allow 'Nginx Full' 2>/dev/null || true
ufw delete allow 'Nginx HTTP' 2>/dev/null || true
ufw delete allow 'Nginx HTTPS' 2>/dev/null || true

echo "--- installing weekly cert renewal cron ---"
cat > /etc/cron.weekly/glaze-tailscale-renew <<'CRON'
#!/bin/bash
set -e
HOSTNAME=\$(tailscale status --json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))")
tailscale cert \
    --cert-file /etc/ssl/tailscale/\${HOSTNAME}.crt \
    --key-file  /etc/ssl/tailscale/\${HOSTNAME}.key \
    "\$HOSTNAME"
systemctl reload nginx
CRON
chmod +x /etc/cron.weekly/glaze-tailscale-renew

echo "--- done ---"
echo "Glaze is live at https://\${TAILSCALE_HOSTNAME}"
echo "(only accessible from devices on your Tailscale network)"
REMOTE
