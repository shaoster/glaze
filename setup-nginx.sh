#!/usr/bin/env bash
# One-shot SSL + nginx bootstrap for a fresh droplet.
# Run this once before the first deploy, while no containers are running.
#
# Usage: ./setup-nginx.sh user@host your-domain.com admin@example.com
#
# What this does:
#   1. Installs certbot on the droplet (no host nginx needed — nginx runs in Docker).
#   2. Issues the initial TLS certificate via the standalone challenge
#      (port 80 must be free — run before `docker compose up`).
#   3. Starts the Docker Compose stack (nginx container takes over port 80/443).
#   4. Re-issues using the webroot challenge to switch renewal to zero-downtime mode.
#   5. Installs a deploy hook that reloads the nginx container after each renewal.
#   6. Opens firewall ports 80 and 443.
#
# After this script runs, `certbot renew` (via systemd timer) handles cert renewal
# automatically with zero downtime. Do not re-run — the force-renewal in step 4
# is only needed once to switch from standalone to webroot mode.
set -euo pipefail

HOST=${1:?Usage: ./setup-nginx.sh user@host domain email}
DOMAIN=${2:?Usage: ./setup-nginx.sh user@host domain email}
EMAIL=${3:?Usage: ./setup-nginx.sh user@host domain email}

ssh "$HOST" env DOMAIN="$DOMAIN" EMAIL="$EMAIL" bash <<'REMOTE'
set -euo pipefail

echo "--- installing certbot ---"
apt-get update -q
apt-get install -y -q certbot

echo "--- creating ACME webroot directory ---"
mkdir -p /var/www/certbot-challenges

echo "--- issuing initial certificate (standalone) ---"
# Uses port 80 directly; Docker Compose must not be running yet.
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "${EMAIL}" \
    --domains "${DOMAIN}"

echo "--- starting Docker Compose stack ---"
cd ~/glaze
docker compose --profile production up -d

echo "--- waiting for nginx to be ready ---"
for i in $(seq 1 24); do
    if docker compose exec -T nginx nginx -t 2>/dev/null; then
        break
    fi
    echo "  waiting... ($i/24)"
    sleep 5
done

echo "--- switching cert renewal to webroot (zero-downtime) ---"
# nginx is now serving /.well-known/acme-challenge/ from /var/www/certbot-challenges.
# Force-renewing with --webroot updates the renewal config so future `certbot renew`
# calls use webroot and nginx stays up throughout.
certbot certonly \
    --webroot \
    -w /var/www/certbot-challenges \
    --non-interactive \
    --agree-tos \
    --email "${EMAIL}" \
    --domains "${DOMAIN}" \
    --force-renewal

echo "--- installing nginx reload hook ---"
# Runs after every successful renewal; reloads nginx to pick up the new cert.
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/01-glaze-nginx-reload.sh <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
cd ~/glaze
docker compose exec -T nginx nginx -s reload
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/01-glaze-nginx-reload.sh

echo "--- configuring firewall ---"
ufw allow 80/tcp
ufw allow 443/tcp
ufw delete allow 8000/tcp 2>/dev/null || true

echo "--- done ---"
echo "Glaze is live at https://${DOMAIN}"
echo "Cert renewal is handled by the certbot systemd timer (runs twice daily)."
REMOTE
