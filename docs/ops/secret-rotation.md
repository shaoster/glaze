# Secret Rotation Runbook

Run this annually, after any suspected exposure, or after any collaborator offboarding. `TAILSCALE_AUTH_KEY` has a 90-day expiry and must be rotated on that cadence.

## How Rotation Works

Infisical is the single source of truth. ESO polls Infisical every hour and syncs changes to the `glaze-secrets` k8s Secret automatically. The rotation flow for most secrets is:

1. Generate a new credential in the relevant dashboard
2. Update the value in Infisical (`glaze-production` project → `prod` environment)
3. ESO propagates the change to the cluster within 1 hour
4. Restart affected pods to pick up the new value

For an **immediate** sync (e.g., suspected breach), see [Incident Response](incident-response.md).

---

## Secrets Inventory

### App secrets (managed via Infisical → ESO)

| Secret | Dashboard | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | n/a — script below | Requires `ALTER USER` + pod restart |
| `SECRET_KEY` | n/a — script below | Invalidates all active user sessions |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 → Manage API Tokens | Create a new scoped token, update both values in Infisical together, then revoke the old token |
| `EMAIL_HOST_PASSWORD` | [Resend Dashboard](https://resend.com/api-keys) | Generate new key, revoke old |
| `GRAFANA_CLOUD_INSTANCE_ID` | Grafana Cloud stack → Details → OpenTelemetry / OTLP setup | Stack-scoped username used by the collector for Basic auth; rarely changes |
| `GRAFANA_CLOUD_OTLP_TOKEN` | Grafana Cloud stack → Details → OpenTelemetry / OTLP setup | Raw stack-scoped Cloud Access Policy token for OTLP; only the collector consumes it |
| `MODAL_AUTH_TOKEN` | Modal Dashboard → Settings → Auth Tokens | |
| `GOOGLE_OAUTH_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials | Select the OAuth 2.0 client, regenerate secret |
| `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` / `DROPBOX_REFRESH_TOKEN` | [Dropbox App Console](https://www.dropbox.com/developers/apps) | See Dropbox section below |

### Infrastructure secrets (managed via GitHub Secrets)

| Secret | Where to rotate | Notes |
|---|---|---|
| `INFISICAL_CLIENT_SECRET` | Infisical → Access Control → Machine Identities → `glaze-eso` | See section below |
| `TAILSCALE_AUTH_KEY` | Tailscale Admin → Settings → Keys | 90-day expiry — see section below |
| `BAZEL_REMOTE_API_KEY` | BuildBuddy dashboard | CI only — update `BAZEL_REMOTE_API_KEY` GitHub secret |
| `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` | Modal Dashboard | Modal deploy job only |

---

## Step-by-Step Rotation

### Django `SECRET_KEY`

```bash
python3 -c "
import secrets, string
alphabet = string.ascii_letters + string.digits + '!@#\$%^&*(-_=+)'
print(''.join(secrets.choice(alphabet) for _ in range(50)))
"
```

Update in Infisical. After ESO syncs, restart web and worker pods:
```bash
KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl rollout restart deployment/glaze-web deployment/glaze-worker
```

> Note: all active user sessions are invalidated on restart.

### `POSTGRES_PASSWORD`

1. Generate a new password (use the script above or a password manager)
2. Update the database:
   ```bash
   KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl exec -it \
     $(kubectl get pod -l app=glaze-postgres -o jsonpath='{.items[0].metadata.name}') -- \
     psql -U glaze -c "ALTER USER glaze WITH PASSWORD '<new-password>';"
   ```
3. Update in Infisical
4. After ESO syncs, restart web, worker, and otelcol pods:
   ```bash
   KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl rollout restart \
     deployment/glaze-web deployment/glaze-worker deployment/glaze-otelcol
   ```

### `GRAFANA_CLOUD_OTLP_TOKEN`

1. Open your Grafana Cloud stack, then go to **Details** → **OpenTelemetry** or **Send Traces / OTLP**
2. Use the stack-scoped OTLP setup flow to create or view the stack's **Cloud Access Policy token**
   - This is the raw token Grafana expects for OTLP ingest
   - Do not use a generic org-wide API key
3. Copy the `instance_id` / user value shown in the same OTLP setup flow if you need to update it
4. Update `GRAFANA_CLOUD_INSTANCE_ID` and `GRAFANA_CLOUD_OTLP_TOKEN` in Infisical (`glaze-production` → `prod`)
   - The collector now builds the Basic auth header itself on startup
5. Force an immediate ESO sync:
   ```bash
   KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl annotate externalsecret glaze-secrets \
     -n default force-sync=$(date +%s) --overwrite
   ```
6. Restart otelcol to pick up the new values:
   ```bash
   KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl rollout restart deployment/glaze-otelcol
   ```
7. Revoke the old token in the Grafana Cloud Access Policies or OTLP setup screen

### Dropbox tokens

Dropbox uses an offline refresh token. If `DROPBOX_REFRESH_TOKEN` needs to be rotated:

1. Go to the Dropbox App Console → your app → OAuth 2 → Generate access token
2. Use the Dropbox OAuth flow to obtain a new refresh token (see the existing backup script for the OAuth scope requirements)
3. Update `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, and `DROPBOX_REFRESH_TOKEN` in Infisical

### `INFISICAL_CLIENT_SECRET` (ESO machine identity)

This is a bootstrap credential stored in GitHub Secrets, not in Infisical itself.

1. In Infisical: Access Control → Machine Identities → `glaze-eso` → Client Credentials → Create new
2. Update `INFISICAL_CLIENT_SECRET` in GitHub Secrets:
   ```bash
   gh secret set INFISICAL_CLIENT_SECRET --env glaze-droplet --body "<new-secret>"
   ```
3. The next CD deploy will push the new credential to the cluster via the "Bootstrap ESO credentials" step
4. Revoke the old client credential in Infisical

### `TAILSCALE_AUTH_KEY` (90-day rotation)

1. In Tailscale admin: **Settings → Keys → Generate auth key**
   - Reusable: **yes**
   - Ephemeral: **yes**
   - Pre-authorized: **yes**
   - Tags: **tag:ci**
   - Expiry: **90 days**
2. Update in GitHub Secrets (paste interactively — do not put the key in shell history):
   ```bash
   gh secret set TAILSCALE_AUTH_KEY --repo shaoster/glaze
   ```
3. Trigger a manual CD run to verify the new key works:
   ```bash
   gh workflow run cd.yml --repo shaoster/glaze --ref main
   ```
4. Once the deploy succeeds, revoke the old key: **Settings → Keys → ⋯ → Delete**

---

## Post-Rotation Checklist

- [ ] All Infisical secrets updated
- [ ] `INFISICAL_CLIENT_SECRET` rotated and updated in GitHub
- [ ] `TAILSCALE_AUTH_KEY` rotated and updated in GitHub (every 90 days)
- [ ] `BAZEL_REMOTE_API_KEY` rotated and updated in GitHub
- [ ] `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` rotated if applicable
- [ ] Old credentials revoked in their respective dashboards
- [ ] Smoke test passing after pod restarts
- [ ] Calendar reminder set for next annual rotation
- [ ] This checklist copied/linked as a comment on the rotation tracking issue

---

## Immediate Rotation (Suspected Breach)

If you suspect a secret has been compromised, do not wait for the 1-hour ESO sync cycle. See [Incident Response](incident-response.md).
