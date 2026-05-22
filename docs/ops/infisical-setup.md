# Infisical + ESO Bootstrap Guide

One-time setup to migrate secrets from manual k8s management to Infisical Cloud + External Secrets Operator.

## Prerequisites

- Access to the k3s droplet via Tailscale
- `kubectl` configured against the cluster (`KUBECONFIG=/etc/rancher/k3s/k3s.yaml`)
- `helm` available on the droplet

---

## 1. Create Infisical Account and Project

1. Sign up at [infisical.com](https://infisical.com) (free Personal tier)
2. Create a new project — name it `glaze-production`
3. Note the **project slug** (shown in the URL and project settings)

### Load all secrets into the `prod` environment

Navigate to the project's **prod** environment and add each key:

| Key | Source |
|---|---|
| `POSTGRES_PASSWORD` | Current k8s secret or `.env.production` |
| `SECRET_KEY` | Current k8s secret |
| `CLOUDINARY_API_KEY` | Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Cloudinary dashboard |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud Console |
| `EMAIL_HOST_PASSWORD` | Resend dashboard |
| `GRAFANA_CLOUD_OTLP_TOKEN` | Grafana Cloud dashboard |
| `MODAL_AUTH_TOKEN` | Modal dashboard |
| `DROPBOX_APP_KEY` | Dropbox developer console |
| `DROPBOX_APP_SECRET` | Dropbox developer console |
| `DROPBOX_REFRESH_TOKEN` | Dropbox developer console |

### Create a machine identity for ESO

1. In Infisical: **Access Control → Machine Identities → Create**
2. Name it `glaze-eso`
3. Assign it **read-only** access to the `glaze-production` project, `prod` environment
4. Under **Universal Auth**: create a client credential
5. Copy the **Client ID** and **Client Secret** — you will not see the secret again

---

## 2. Install External Secrets Operator on k3s

SSH to the droplet and run:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets \
  --create-namespace \
  --set installCRDs=true
```

Verify:
```bash
KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get pods -n external-secrets
```

---

## 3. Update GitHub Secrets and Variables

### Remove (no longer needed after migration is verified)

```bash
# App secrets — now managed by Infisical
gh secret delete DEPLOY_SSH_KEY --env glaze-droplet
gh secret delete POSTGRES_PASSWORD --env glaze-droplet
gh secret delete SECRET_KEY --env glaze-droplet
gh secret delete CLOUDINARY_API_KEY --env glaze-droplet
gh secret delete CLOUDINARY_API_SECRET --env glaze-droplet
gh secret delete GOOGLE_OAUTH_CLIENT_SECRET --env glaze-droplet
gh secret delete EMAIL_HOST_PASSWORD --env glaze-droplet
gh secret delete GRAFANA_CLOUD_OTLP_TOKEN --env glaze-droplet
gh secret delete MODAL_AUTH_TOKEN --env glaze-droplet
gh secret delete DROPBOX_APP_KEY --env glaze-droplet
gh secret delete DROPBOX_APP_SECRET --env glaze-droplet
gh secret delete DROPBOX_REFRESH_TOKEN --env glaze-droplet
```

### Add

```bash
# Infisical ESO machine identity
gh secret set INFISICAL_CLIENT_ID --env glaze-droplet --body "<client-id>"
gh secret set INFISICAL_CLIENT_SECRET --env glaze-droplet --body "<client-secret>"

# Tailscale OAuth client (see section 4)
gh secret set TAILSCALE_OAUTH_CLIENT_ID --env glaze-droplet --body "<oauth-client-id>"
gh secret set TAILSCALE_OAUTH_CLIENT_SECRET --env glaze-droplet --body "<oauth-client-secret>"

# Infisical project slug (non-secret variable)
gh variable set INFISICAL_PROJECT_SLUG --env glaze-droplet --body "glaze-production"

# Tailscale IP or hostname of the droplet (non-secret variable)
gh variable set DEPLOY_HOST_TAILSCALE --env glaze-droplet --body "<user>@<tailscale-ip>"
```

---

## 4. Set Up Tailscale SSH

This replaces `DEPLOY_SSH_KEY` for CI/CD deploy access.

### On the droplet

Enable Tailscale SSH:
```bash
sudo tailscale up --ssh
```

### In Tailscale admin console

1. Go to **Access Controls** and add a tag-based ACL rule:

```json
{
  "tagOwners": {
    "tag:ci": ["autogroup:admin"],
    "tag:prod-server": ["autogroup:admin"]
  },
  "acls": [
    {
      "action": "accept",
      "src": ["tag:ci"],
      "dst": ["tag:prod-server:22"]
    }
  ]
}
```

2. Tag the droplet as `tag:prod-server` in the Tailscale admin machines list.

### Create Tailscale OAuth client for GitHub Actions

1. In Tailscale admin: **Settings → OAuth Clients → Generate OAuth Client**
2. Scope: **Devices: write** (needed to create ephemeral nodes)
3. Pre-approved tags: `tag:ci`
4. Copy **Client ID** and **Client Secret** → add to GitHub Secrets (see section 3)

---

## 5. Request Cure53 Audit Report

Email `security@infisical.com` requesting the Cure53 penetration test report before go-live. This is a due-diligence step — see `docs/ops/incident-response.md` for the broader trust model.

---

## 6. Verify the Migration

After the first successful CD deploy with the new workflow:

```bash
# Confirm ESO created and populated glaze-secrets
KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get secret glaze-secrets -o yaml

# Confirm all 11 keys are present
KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get secret glaze-secrets \
  -o jsonpath='{.data}' | python3 -c "import sys,json; print(list(json.load(sys.stdin).keys()))"

# Confirm ExternalSecret status is Ready
KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get externalsecret glaze-secrets
```

Expected output for the last command:
```
NAME            STORE       REFRESH INTERVAL   STATUS   READY
glaze-secrets   infisical   1h                 Valid    True
```
