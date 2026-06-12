# Self-Hosting PotterDoc with Docker Compose

This directory contains configuration files and instructions to deploy a self-hosted instance of PotterDoc (`glaze`) using **Docker Compose**. This setup is a completely self-contained deployment target containing:
- **`web`**: The Django ASGI backend application, which also serves the Vite React frontend static assets via WhiteNoise.
- **`worker`**: The Celery async task worker.
- **`db`**: A PostgreSQL 17 database container with persistent volume storage.
- **`redis`**: A Redis 7 cache and broker container.
- **`nginx`**: An Nginx reverse proxy serving HTTPS and static files.
- **`certbot`**: A Let's Encrypt Certbot agent that automatically renews SSL certificates.

---

## Directory Structure

All configuration files are organized inside this directory:
- [docker-compose.yml](file:///home/phil/code/glaze/infra/custom/docker-compose.yml): Services definition.
- [nginx/templates/glaze.conf.template](file:///home/phil/code/glaze/infra/custom/nginx/templates/glaze.conf.template): Reverse proxy config template with TLS.
- [scripts/init-letsencrypt.sh](file:///home/phil/code/glaze/infra/custom/scripts/init-letsencrypt.sh): SSL certificates initialization helper.

---

## Prerequisites

Ensure the following are installed on the target machine (local or VM):
- **Docker** (v20.10+)
- **Docker Compose** (v2.0+)

---

## 1. Local Deployment (HTTP / Private Network)

For local testing or deploying on a private network without domain names or SSL certificates, you can run the application directly over HTTP.

### Step 1: Create a `.env` file
Create a `.env` file in this directory (`infra/custom/.env`):

```ini
# Database credentials
POSTGRES_PASSWORD=choose_a_secure_password

# Django security settings
SECRET_KEY=generate_a_long_random_secret_key

# Hostname setup
ALLOWED_HOSTS=localhost,127.0.0.1
DOMAIN=localhost

# Leave PRODUCTION empty to disable HTTPS redirects and SSL enforcement locally
PRODUCTION=
```

### Step 2: Load the App Image and Start the Stack
From this directory (`infra/custom/`), first load the Bazel-built app image into Docker:

```bash
bazel run //:load
```

Then start the stack:

```bash
docker compose up -d
```

### Step 3: Access the Application
- Access the web interface at **`http://localhost:8000`**.
- Database migrations, public library fixtures loading, and task cleanup will run automatically during startup via the `deploy_init` container.

---

## 2. VM Deployment (HTTPS / Let's Encrypt SSL)

To deploy to a virtual machine (e.g., DigitalOcean, AWS EC2, Linode) with production-grade HTTPS:

### Step 1: DNS & Network Setup
1. Point your domain (e.g., `yourdomain.com` and `www.yourdomain.com`) to the public IP address of your VM using an `A` record.
2. Open ports **`80`** and **`443`** on your VM firewall to allow public incoming traffic.

### Step 2: Configure the VM `.env` File
Create a `.env` file in this directory (`infra/custom/.env`) on your VM:

```ini
# Production environment flag (Enforces HTTPS/secure cookies in Django)
PRODUCTION=True

# Secrets
POSTGRES_PASSWORD=your_super_secure_db_password
SECRET_KEY=your_highly_secure_django_secret_key

# Domain configurations
DOMAIN=yourdomain.com
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# (Optional) Cloudflare R2 credentials for image storage (all five required together)
# R2_ACCOUNT_ID=your_cloudflare_account_id
# R2_ACCESS_KEY_ID=your_r2_token_key_id
# R2_SECRET_ACCESS_KEY=your_r2_token_secret
# R2_BUCKET_NAME=your_bucket_name
# R2_PUBLIC_URL=https://media.yourdomain.com

# (Optional) Google OAuth Client ID for sign-in
# GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id

# (Optional) Outgoing Email Settings (for admin invites)
# EMAIL_HOST=smtp.resend.com
# EMAIL_PORT=465
# EMAIL_HOST_USER=resend
# EMAIL_HOST_PASSWORD=your_smtp_password
```

Also verify that the certbot reload hook helper scripts are set up:
- Certbot deploy hook: [01-glaze-nginx-reload.sh](file:///home/phil/code/glaze/certbot/renewal-hooks/deploy/01-glaze-nginx-reload.sh)

### Step 3: Initialize SSL Certificates
Let's Encrypt requires a running web server to solve the HTTP-01 challenge, but Nginx will fail to start if its SSL certificate files are missing on disk. Run the bootstrap script in this folder to bypass this:

```bash
./scripts/init-letsencrypt.sh
```

This script:
1. Provisions dummy certificates so Nginx starts successfully.
2. Starts the Nginx reverse proxy.
3. Deletes the dummy certificates and requests real Let's Encrypt certificates.
4. Reloads Nginx with the newly acquired certificates.

### Step 4: Run the Complete Stack
Start the remaining containers (database, cache, web application, celery worker, and certbot renewal loop):

```bash
docker compose up -d
```

Your app is now live and secure at **`https://yourdomain.com`**!

---

## Certificate Renewal

The `certbot` service checks for certificate renewals every 12 hours.
When a certificate is successfully renewed, a deploy hook automatically executes Nginx's reload command to pick up the new certificate with zero downtime.

---

## Operational Commands

All commands should be run from this directory (`infra/custom/`):

### View Service Logs
```bash
docker compose logs -f
```

To view logs for a specific service:
```bash
docker compose logs -f web
docker compose logs -f nginx
```

### Create a Django Superuser
To create an admin account for the Django backend console:
```bash
docker compose exec web python manage.py createsuperuser
```

### Database Backups
To take a manual PostgreSQL database backup:
```bash
docker compose exec db pg_dump -U glaze glaze > glaze_backup.sql
```

To restore a database backup:
```bash
docker compose exec -T db psql -U glaze -d glaze < glaze_backup.sql
```
