# CI / CD Infrastructure

This document describes the GitHub Actions workflows and deployment pipeline for Glaze.

## Security mandate: no production secrets in CI

**`ci.yml` MUST NEVER have access to production secrets.** All CI jobs (tests, linting, OCI image build) run against public placeholders or temporary test keys. Real production secrets are restricted to `cd.yml` and `cluster-setup.yml`, which run in the `glaze-droplet` environment.

---

## Workflows

### `ci.yml` — Continuous Integration

Runs on every pull request and every push to `main`. Skips doc-only changes (`.md`, `.vscode/`, etc.).

| Job | Trigger | What it does |
|---|---|---|
| **Preflight** | Always | Computes a CI fingerprint; fails if production secrets are detected in the workflow. |
| **Lint** | PRs always; `main` only when `skip_main=false` | `gz_lint` — ruff, ESLint, tsc, mypy via Bazel. |
| **Coverage & Test** | PRs always; `main` only when `skip_main=false` | `gz_test --coverage` then uploads to Codecov. |
| **Build & smoke-test OCI image** | Always | Builds the OCI image with Bazel, starts the full `docker compose` stack, waits for health. On `push` to `main`, also pushes to `ghcr.io/shaoster/glaze`. |
| **Record fingerprint** | PRs only | Uploads `ci-fingerprint-<hash>` so the next `main` push can skip lint/coverage. |

#### Skip-main optimization

The fingerprint-based skip avoids re-running lint and coverage on `main` when the same tree was already validated by a PR. The OCI image job always runs on `main` — it is the gate for pushing to the registry and triggering CD.

---

### `cd.yml` — Continuous Deployment

Triggers:
- Automatically after CI completes successfully on `main` (via `workflow_run`)
- On `push` to `main` for `chart/**` changes (chart-only deploys skip CI entirely)
- Manually via `workflow_dispatch` (optionally targeting a specific SHA)

| Job | What it does |
|---|---|
| **Deploy to droplet** | Resolves image tag, runs `tools/ensure_cluster.sh` (converges infra and waits for `glaze-secrets`), renders Helm values override, then runs `tools/helm_deploy.sh` to upgrade the Helm release. Creates a GitHub Release tagged `release-<sha>` on success (skipped for chart-only pushes). |
| **Deploy Services to Modal** | Deploys each module under `services/` via `modal deploy`. Runs in parallel with the droplet deploy. |

Chart-only pushes (`chart/**` with no corresponding CI run) have no Docker image built for the commit SHA. CD resolves the correct image tag by reading the latest GitHub Release.

The Helm release includes an hourly database backup CronJob that creates a Postgres dump, verifies it contains nonzero rows, and uploads to Dropbox. Old backups are pruned to a 30-day retention window.

#### Required secrets / variables

All scoped to the `glaze-droplet` environment in **Settings → Environments**.

| Name | Kind | Description |
|---|---|---|
| `TAILSCALE_AUTH_KEY` | Secret | Ephemeral auth key for Tailscale GitHub Action |
| `INFISICAL_CLIENT_ID` | Secret | Infisical machine identity (ESO authentication) |
| `INFISICAL_CLIENT_SECRET` | Secret | Infisical machine identity secret |
| `MODAL_TOKEN_ID` | Secret | Modal authentication token ID |
| `MODAL_TOKEN_SECRET` | Secret | Modal authentication token secret |
| `DEPLOY_HOST_TAILSCALE` | Variable | Tailscale MagicDNS hostname of the droplet |
| `INFISICAL_PROJECT_SLUG` | Variable | Infisical project slug for ESO ClusterSecretStore |
| `ALLOWED_HOST` | Variable | Django `ALLOWED_HOSTS` entry (the droplet hostname) |
| `APP_ORIGIN` | Variable | Full origin URL, e.g. `https://potterdoc.com` |
| `GOOGLE_OAUTH_CLIENT_ID` | Variable | Google OAuth client ID |
| `CLOUDINARY_CLOUD_NAME` | Variable | Cloudinary cloud name |
| `CLOUDINARY_UPLOAD_FOLDER` | Variable | Cloudinary folder for user-uploaded images |
| `CLOUDINARY_UPLOAD_PRESET` | Variable | Cloudinary upload preset |
| `CLOUDINARY_PUBLIC_UPLOAD_FOLDER` | Variable | Cloudinary folder for public library images |

All other app secrets (Django `SECRET_KEY`, Postgres password, Cloudinary API key/secret, Grafana OTLP token) are managed in Infisical and synced into the cluster by ESO — CD does not need them directly.

---

### `cluster-setup.yml` — Cluster Infrastructure Convergence

Triggers:
- On `push` to `main` for `infra/**` or `tools/ensure_cluster.sh`
- Manually via `workflow_dispatch`

Also runs unconditionally as the first step of `cd.yml` (`Ensure cluster`) — so every deploy self-heals a degraded cluster without manual intervention.

Runs `tools/ensure_cluster.sh`:
1. Sync `/etc/rancher/k3s/config.yaml` and restart k3s if changed
2. Sync k3s auto-deploy manifests to `/var/lib/rancher/k3s/server/manifests/`
   (includes `probe-timeouts.yaml` — declarative `HelmChartConfig` for system component probe timeouts)
3. Bootstrap Infisical machine identity as a Kubernetes Secret for ESO
4. Wait for ESO to be ready

---

### `static.yml` — GitHub Pages

Deploys the `pages/` directory to GitHub Pages. Runs `tools/generate_index.py` before uploading.

---

## Shared composite action: `actions/setup-bazel-ci`

Sets up a consistent Bazel environment: configures BuildBuddy remote cache and restores a GitHub Actions cache keyed on `MODULE.bazel`, lock files, and `.bazelversion`.

---

## Deploy flow summary

```
PR opened
  └─ CI: preflight -> lint + coverage + image build/smoke-test
       └─ record-fingerprint artifact uploaded on success

PR merged to main (code change)
  └─ CI: preflight checks artifact -> skip lint/coverage if already validated
       └─ image job always runs -> pushes ghcr.io/shaoster/glaze:<sha>
            └─ CD: resolve tag -> render values -> wait for glaze-secrets
                 -> helm_deploy.sh -> GitHub Release
                 └─ (parallel) deploy-modal job

PR merged to main (chart/** change only)
  └─ CD: chart-only push trigger fires directly (no CI)
       -> resolve tag from latest GitHub Release
       -> ensure_cluster.sh -> render values -> helm_deploy.sh

Push to infra/**
  └─ cluster-setup: ensure_cluster.sh
       (k3s config -> manifests -> ESO bootstrap -> ClusterSecretStore infisical -> wait for ESO -> glaze-secrets)
```

---

## Production topology

```
Internet :80/:443
    ├─ public potterdoc.com / www.potterdoc.com
    │    └─ Traefik public LoadBalancer
    │         └─ glaze-web:8000 (Deployment, 1 replica)
    │              └─ postgres:5432 (StatefulSet, 1 replica)
    └─ tailnet admin/headlamp
         └─ Tailscale operator LoadBalancer
              └─ Traefik tailnet service
                   ├─ admin.potterdoc.com/admin/
                   └─ headlamp.potterdoc.com/
```

App secrets are synced from Infisical into `glaze-secrets` (Kubernetes Secret) by External Secrets Operator.

### Operational commands

```bash
# Check pod health
kubectl get pods -n default

# Watch warning events
kubectl get events -A --field-selector type=Warning --sort-by=.lastTimestamp

# Tail web pod logs
kubectl logs -n default -l app.kubernetes.io/component=web -f

# Helm release status
helm status glaze -n default
```

### Rollback

Re-run CD via `workflow_dispatch` with the previous commit SHA. Helm will roll back the chart to that release.

### One-time cluster bootstrap

If setting up a fresh droplet:
1. Run `tools/ensure_k3s_tailscale.sh [user@host] [tailscale-auth-key]` to join the tailnet
2. Install k3s on the host manually (see `infra/k3s/`)
3. Run `cluster-setup.yml` via `workflow_dispatch` to converge infra
4. Run `cd.yml` via `workflow_dispatch` to deploy the app
