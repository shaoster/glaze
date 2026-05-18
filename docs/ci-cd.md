# CI / CD Infrastructure

This document describes the GitHub Actions workflows and deployment pipeline for Glaze.

## Workflows

### `ci.yml` - Continuous Integration

Runs on every pull request and every push to `main`. Skips doc-only changes (`.md`, `.vscode/`, `nginx/`, etc.).

#### Jobs

| Job | Trigger | What it does |
|---|---|---|
| **Preflight** | Always | Computes a CI fingerprint from the git tree SHA plus hashes of `ci.yml`, `MODULE.bazel`, `.bazelversion`, `pyproject.toml`, `uv.lock`, and `web/pnpm-lock.yaml`. On a `push` to `main`, looks up whether that fingerprint was already validated by a prior PR run - if so, sets `skip_main=true` to avoid re-running lint and coverage on an already-validated tree. |
| **Lint** | PRs always; `main` only when `skip_main=false` | Runs `gz_lint` (`bazel build --config=lint //...`) - ruff, ESLint, tsc, and mypy. |
| **Coverage & Test** | PRs always; `main` only when `skip_main=false` | Runs `gz_test --coverage` (`bazel coverage //...`) then uploads the merged LCOV report to Codecov. |
| **Build & smoke-test OCI image** | Always (including `main` regardless of `skip_main`) | Builds the OCI image with Bazel (`bazel run --config=ci --stamp //:load`), writes `VITE_GOOGLE_CLIENT_ID` from Actions secrets into `web/.env.local` before the build so it is baked into the JS bundle, pre-pulls sidecar images (Postgres, OpenTelemetry Collector), starts the full `docker compose` stack, and waits up to 300 s for the healthcheck to pass. On `push` to `main`, also pushes the image to `ghcr.io/shaoster/glaze` tagged with `:latest` and the commit SHA. |
| **Record fingerprint** | PRs only, after all three above succeed | Uploads a tiny artifact named `ci-fingerprint-<hash>` (retained 30 days). The Preflight job on the next `main` push checks for this artifact to decide whether `skip_main=true`. |

#### Skip-main optimization

The fingerprint-based skip avoids re-running lint and coverage on `main` when the exact same tree was already validated by a PR. The OCI image job always runs on `main` regardless - it is the gate for pushing to the registry and triggering CD.

#### Required secrets / variables

| Name | Kind | Used by |
|---|---|---|
| `BAZEL_REMOTE_API_KEY` | Secret | BuildBuddy remote cache authentication |
| `VITE_GOOGLE_CLIENT_ID` | Secret | Baked into the JS bundle at image build time |

---

### `cd.yml` - Continuous Deployment

Runs automatically after CI completes successfully on `main`, or manually via `workflow_dispatch` (optionally targeting a specific SHA).

#### Jobs

| Job | What it does |
|---|---|
| **Deploy to droplet** | Renders `.env.production.template` with secrets and variables into `/tmp/.env`, SCPs it to the droplet, then runs `deploy.sh` to pull the new image and restart the stack. Creates a GitHub Release tagged `release-<sha>` on success. Runs in the `glaze-droplet` environment with `concurrency: deploy-production` (never cancels in-progress deploys). |
| **Deploy Services to Modal** | Deploys the `services/` directory to Modal using `modal deploy services`. Runs in parallel with the droplet deploy. |

#### Required secrets / variables

All are scoped to the `glaze-droplet` environment in **Settings -> Environments**.

| Name | Kind | Description |
|---|---|---|
| `DEPLOY_SSH_KEY` | Secret | Ed25519 private key for SSH access to the droplet |
| `SECRET_KEY` | Secret | Django `SECRET_KEY` |
| `POSTGRES_PASSWORD` | Secret | Postgres password |
| `CLOUDINARY_API_KEY` | Secret | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Secret | Cloudinary API secret |
| `MODAL_TOKEN_ID` | Secret | Modal authentication token ID |
| `MODAL_TOKEN_SECRET` | Secret | Modal authentication token secret |
| `GRAFANA_CLOUD_OTLP_TOKEN` | Secret | Grafana Cloud OTLP ingest token |
| `DEPLOY_HOST` | Variable | `user@hostname` for the droplet |
| `ALLOWED_HOST` | Variable | Django `ALLOWED_HOSTS` entry (the droplet hostname) |
| `APP_ORIGIN` | Variable | Full origin URL, e.g. `https://myapp.example.com` |
| `GOOGLE_OAUTH_CLIENT_ID` | Variable | Google OAuth client ID (backend JWT verification) |
| `VITE_GOOGLE_CLIENT_ID` | Variable | Same client ID, baked into the JS bundle |
| `CLOUDINARY_CLOUD_NAME` | Variable | Cloudinary cloud name |
| `CLOUDINARY_UPLOAD_FOLDER` | Variable | Cloudinary folder for user-uploaded images |
| `CLOUDINARY_UPLOAD_PRESET` | Variable | Cloudinary upload preset |
| `CLOUDINARY_PUBLIC_UPLOAD_FOLDER` | Variable | Cloudinary folder for public library images |
| `REMOTE_REMBG_URL` | Variable | URL of the Modal segment microservice |
| `OTEL_ENABLED` | Variable | Set to `true` to enable OpenTelemetry on startup |

---

### `static.yml` - GitHub Pages

Deploys the `pages/` directory to GitHub Pages. Runs on pushes to `main` that touch `pages/**` or `tools/generate_index.py`, and supports manual dispatch. Runs `python tools/generate_index.py pages` to generate the index before uploading.

---

## Shared composite action: `actions/setup-bazel-ci`

Used by the lint, coverage, and image jobs to set up a consistent Bazel environment:

- Checks out and configures the Bazel remote cache (BuildBuddy) via `BAZEL_REMOTE_API_KEY`.
- Restores a GitHub Actions cache keyed on `deps-key` (a hash of `MODULE.bazel`, lock files, and `.bazelversion`) so external dependency fetches are cached across runs.
- Each job passes a `cache-key-prefix` (`lint`, `coverage`, `image`) so their caches don't collide.

## Deploy flow summary

```
PR opened
  └─ CI: preflight -> lint + coverage + image build/smoke-test
       └─ record-fingerprint artifact uploaded on success

PR merged to main
  └─ CI: preflight checks artifact -> skip lint/coverage if already validated
       └─ image job always runs -> pushes ghcr.io/shaoster/glaze:latest + :<sha>
            └─ CD triggered by workflow_run on success
                 ├─ deploy job: SCP .env -> deploy.sh -> docker compose pull + restart -> GitHub Release
                 └─ deploy-modal job: modal deploy services
```

nginx config changes (in `nginx/conf.d/`) are deployed automatically with every release — `docker compose up -d --force-recreate` mounts the config at the checked-out SHA with no separate sync step.

---

## Production upstream topology

```
Internet :80/:443
    └─ nginx container (nginx:alpine)
         └─ web:8000  (2 replicas — Docker DNS round-robins across both)
```

`web` runs with `deploy.replicas: 2`; both replicas are only reachable within the Docker network (no host port bindings). Docker's internal DNS returns both replica IPs at nginx startup; nginx round-robins across them with `max_fails=1 fail_timeout=10s`. A raw-IP `default_server` block returns 444 before requests reach Django.

### Operational commands

```bash
# Check replica readiness (runs against one replica; repeat to hit the other)
docker compose exec nginx wget -qO- http://web:8000/api/health/ready/

# Validate nginx config
docker compose exec nginx nginx -t

# Check TLS certificate expiry (host)
certbot certificates

# Watch nginx access/error log
docker compose logs -f nginx

# List replicas and their status
docker compose ps web

# Cert renewal dry run (should complete with zero nginx restarts)
certbot renew --dry-run
```

### Rollback

If a deploy leaves one or both API instances unhealthy, roll back by re-running `deploy.sh` with the previous commit SHA. The nginx container is unaffected unless `nginx/conf.d/` changed.
