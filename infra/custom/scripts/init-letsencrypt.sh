#!/usr/bin/env bash
# Initialize Let's Encrypt certificates for the Docker Compose deployment.

set -euo pipefail

# Make sure we are in the directory containing this script's parent (infra/custom/)
cd "$(dirname "$0")/.."

# Check if docker is installed
if ! [ -x "$(command -v docker)" ]; then
  echo "Error: docker is not installed." >&2
  exit 1
fi

if [ -f .env ]; then
  # Read variables from .env
  DOMAIN=$(grep -E "^DOMAIN=" .env | cut -d= -f2- | tr -d '"' | tr -d "'")
  EMAIL=$(grep -E "^EMAIL=" .env | cut -d= -f2- | tr -d '"' | tr -d "'")
else
  DOMAIN=""
  EMAIL=""
fi

if [ -z "${DOMAIN:-}" ] || [ -z "${EMAIL:-}" ]; then
  echo "Error: DOMAIN and EMAIL must be set in your .env file."
  echo "Example .env content:"
  echo "DOMAIN=example.com"
  echo "EMAIL=admin@example.com"
  echo "POSTGRES_PASSWORD=secure_db_password"
  echo "SECRET_KEY=secure_django_secret_key"
  exit 1
fi

if [ "$DOMAIN" = "localhost" ] || [ "$DOMAIN" = "127.0.0.1" ]; then
  echo "Error: Let's Encrypt does not support generating certificates for '$DOMAIN'." >&2
  echo "For local testing, access the app directly via HTTP on port 8000 without Nginx." >&2
  exit 1
fi

echo "### Initializing Let's Encrypt certificates for $DOMAIN..."

# Check if certificates already exist
if docker compose run --rm --entrypoint "/bin/sh -c" certbot "[ -d /etc/letsencrypt/live/$DOMAIN ]" 2>/dev/null; then
  echo "Existing certificates found for $DOMAIN. Skipping certificate generation."
  exit 0
fi

echo "### Creating dummy certificate for $DOMAIN so Nginx doesn't crash on start..."
docker compose run --rm --entrypoint "/bin/sh -c" certbot \
  "mkdir -p /etc/letsencrypt/live/$DOMAIN && openssl req -x509 -nodes -newkey rsa:2048 -days 1 -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem -subj '/CN=localhost'"

echo "### Starting Nginx..."
docker compose up --build -d nginx

echo "### Deleting dummy certificates..."
docker compose run --rm --entrypoint "/bin/sh -c" certbot \
  "rm -rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf"

echo "### Requesting real certificates for $DOMAIN..."
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

echo "### Reloading Nginx with the new certificates..."
docker compose exec nginx nginx -s reload

echo "### Let's Encrypt certificates successfully initialized!"
