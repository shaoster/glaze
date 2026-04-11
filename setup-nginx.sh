#!/usr/bin/env bash
# One-shot Nginx + SSL bootstrap for a fresh droplet.
# Run this once after the first `docker compose up -d`.
#
# Usage: ./setup-nginx.sh user@host your-domain.com admin@example.com
#
# What this does:
#   1. Installs Nginx and Certbot on the droplet
#   2. Copies nginx/glaze.conf (with your domain substituted in)
#   3. Opens firewall ports 80 and 443
#   4. Runs `certbot --nginx` to provision a Let's Encrypt cert and rewrite the config
#   5. Reloads Nginx
#
# After this script runs, Certbot manages cert renewal automatically via a
# systemd timer. Do not re-run this script or overwrite the Nginx config —
# that would lose the TLS configuration Certbot added.
set -euo pipefail

HOST=${1:?Usage: ./setup-nginx.sh user@host domain email}
DOMAIN=${2:?Usage: ./setup-nginx.sh user@host domain email}
EMAIL=${3:?Usage: ./setup-nginx.sh user@host domain email}

echo "--- copying Nginx config ---"
# Substitute YOUR_DOMAIN placeholder and stream to the droplet.
sed "s/YOUR_DOMAIN/${DOMAIN}/g" "$(dirname "$0")/nginx/glaze.conf" \
    | ssh "$HOST" "cat > /tmp/glaze.conf"

ssh "$HOST" bash <<REMOTE
set -euo pipefail

echo "--- installing Nginx and Certbot ---"
apt-get update -q
apt-get install -y -q nginx certbot python3-certbot-nginx

echo "--- installing Nginx config ---"
mv /tmp/glaze.conf /etc/nginx/sites-available/glaze
ln -sf /etc/nginx/sites-available/glaze /etc/nginx/sites-enabled/glaze
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "--- opening firewall ports ---"
ufw allow 'Nginx Full'
ufw delete allow 8000 2>/dev/null || true   # close direct Gunicorn port if open

echo "--- provisioning SSL certificate ---"
certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "${EMAIL}" \
    --domains "${DOMAIN}"

echo "--- done ---"
echo "Glaze is live at https://${DOMAIN}"
REMOTE