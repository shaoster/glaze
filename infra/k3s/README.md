# k3s Cluster Bootstrap

This directory contains the configuration for the production k3s cluster running on the DigitalOcean droplet.
The current production layout is single-node, so the firewall guidance below
assumes the control plane, workloads, and ingress all live on one host.

## Cluster Specs

- **Provider**: DigitalOcean (1 vCPU, 1 GB RAM minimum — 2 GB recommended)
- **k3s version**: v1.35.4+k3s1
- **Ingress**: Traefik v3 (bundled with k3s, customized via `traefik.yaml`)
- **TLS**: cert-manager v1.20.2 with Let's Encrypt

## Bootstrap Steps

### 1. Install k3s

```bash
curl -sfL https://get.k3s.io | sh -s - --config /etc/rancher/k3s/config.yaml
```

Copy `config.yaml` from this directory to `/etc/rancher/k3s/config.yaml` **before** running the installer, or restart k3s after placing it:

```bash
scp infra/k3s/config.yaml root@<droplet>:/etc/rancher/k3s/config.yaml
systemctl restart k3s
```

The config disables the bundled metrics-server and servicelb (DigitalOcean handles load balancing), and caps API server request concurrency to reduce memory pressure on 1 GB nodes.

### 2. Enable the host firewall

UFW should allow only the public traffic that belongs on this droplet. Keep SSH
open for administration, keep HTTP/HTTPS open for Traefik, and leave the k3s
API and kubelet off the public internet. This is intentionally scoped to the
current single-node cluster; if we ever add more nodes, we will need to revisit
the pod-network and inter-node rules.

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Verify the allowlist after enabling UFW:

```bash
ufw status verbose
ss -tlnp | grep -E ':(22|80|443|6443|10250|30180)\b'
```

The k3s API is configured to bind to `127.0.0.1`, so `6443` should only appear on localhost. `10250` and `30180` should not be reachable from outside the host.

Because this is a single-node cluster, the host firewall can stay narrow today.
If we move to multi-node later, re-check whether k3s needs explicit allowance
for the pod network interfaces such as `cni0` or `flannel.1` before tightening
the firewall further.

### 3. Apply Traefik configuration

k3s auto-applies HelmChart manifests placed in `/var/lib/rancher/k3s/server/manifests/`. The file is already placed there by the k3s installer, but our customized version should replace it:

```bash
scp infra/k3s/traefik.yaml root@<droplet>:/var/lib/rancher/k3s/server/manifests/traefik.yaml
```

k3s will detect the change and re-apply automatically.

### 4. Install cert-manager

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.20.2 \
  --set crds.enabled=true
```

Then apply the ClusterIssuer for Let's Encrypt:

```bash
kubectl apply -f - << 'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: shaoster@gmail.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            ingressClassName: traefik
EOF
```

### 5. Create the glaze-secrets Secret

This must be done manually before the first `helm install`. Never commit secrets to SCM.

```bash
kubectl create secret generic glaze-secrets \
  --from-literal=POSTGRES_PASSWORD=<value> \
  --from-literal=SECRET_KEY=<value> \
  --from-literal=CLOUDINARY_API_KEY=<value> \
  --from-literal=CLOUDINARY_API_SECRET=<value> \
  --from-literal=EMAIL_HOST_PASSWORD=<value> \
  --from-literal=GRAFANA_CLOUD_OTLP_TOKEN=<value> \
  --from-literal=MODAL_AUTH_TOKEN=<value> \
  --from-literal=GOOGLE_OAUTH_CLIENT_SECRET=<value> \
  --from-literal=DROPBOX_APP_KEY=<value> \
  --from-literal=DROPBOX_APP_SECRET=<value> \
  --from-literal=DROPBOX_REFRESH_TOKEN=<value>
```

The CD pipeline updates this secret automatically on each deploy via `kubectl apply`.

### 6. Enable automated database backups

The Helm chart includes an hourly PostgreSQL backup CronJob. It uses the official
`postgres:17` image to create the dump, restore it into a temporary local Postgres
instance, verify that the restore contains nonzero `auth_user` and `api_piece`
rows, and then upload the dump to Dropbox using a digest-based path. Backups are
pruned to a 30-day retention window by default.

Set up a Dropbox app with scoped access, app-folder access, `files.content.write`
and `files.metadata.read`, then provide the app key, app secret, and refresh token
through the `glaze-secrets` secret above.

### 7. Authenticate with GHCR

The cluster needs to pull images from `ghcr.io/shaoster/glaze`:

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=shaoster \
  --docker-password=<PAT with read:packages>
```

Or log in on the node (k3s uses containerd; credential helper approach):

```bash
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=shaoster \
  --docker-password=<PAT>
```

### 8. Deploy the application

See the CD pipeline (`.github/workflows/cd.yml`) — it handles `helm upgrade --install` automatically on push to `main`.

For a manual deploy:

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
helm upgrade --install glaze chart/glaze/ \
  -f /tmp/values-override.yaml \
  --timeout 5m \
  --wait
```

## What NOT to commit

- `/etc/rancher/k3s/k3s.yaml` — contains the cluster CA and admin credentials
- Any `.env` files with secrets

## Administrative Interface Security

The Django Admin (at both `potterdoc.com/admin/` and `admin.potterdoc.com/admin/`)
and Headlamp (`headlamp.potterdoc.com`) are restricted by a Traefik `IPAllowList`
middleware. You must be connected to Tailscale and use a DNS record that resolves
to the droplet's Tailscale IP (`100.121.152.21`) to access them.

### How the IP allowlist works

Traefik runs with `hostPort` on this single-node cluster. Incoming connections are
DNAT'd by the CNI hostport plugin, and Flannel masquerades external source IPs to
the pod-network bridge gateway (`10.42.0.1`) before the packet reaches Traefik
for ordinary cluster traffic. Tailscale-routed admin traffic preserves the
Tailscale CGNAT source range, so the `IPAllowList` middleware allows
`100.64.0.0/10`.

This means the allowlist is enforced at the **DNS / routing layer**: admin
hostnames resolve to the Tailscale IP (`100.121.152.21`) in Cloudflare as
DNS-only (grey-cloud, reserved IP) records. Traffic that reaches the server via
those records has traversed the Tailscale tunnel; traffic from the public IP
(`159.223.154.68`) never matches those hostnames and is routed to public-facing
ingresses only.

If the cluster ever moves to multi-node or a different CNI, revisit this
allowlist — the masquerade behavior may change.

### DNS records (Cloudflare)

| Hostname | Points to | Proxy |
|---|---|---|
| `admin.potterdoc.com` | `100.121.152.21` (Tailscale IP) | DNS only |
| `headlamp.potterdoc.com` | `100.121.152.21` (Tailscale IP) | DNS only |
| `potterdoc.com` | `159.223.154.68` (public IP) | Proxied |
| `www.potterdoc.com` | `159.223.154.68` (public IP) | Proxied |

### Django Admin
Available at `https://admin.potterdoc.com/admin/` and `https://potterdoc.com/admin/`.
Both are guarded by the `tailscale-only` Traefik middleware. Connect to Tailscale
before accessing either URL.

### Headlamp
Available at `https://headlamp.potterdoc.com/`. Connect to Tailscale before
accessing. The Cloudflare DNS record must remain DNS-only (grey cloud) — Cloudflare
cannot proxy to a reserved/Tailscale IP.

Headlamp requires a token to authenticate to the Kubernetes API. The token is
stored as a long-lived ServiceAccount token in `kube-system/headlamp-token` and
is tracked in `headlamp.yaml`. Retrieve it with:

```bash
ssh root@<droplet> "KUBECONFIG=/etc/rancher/k3s/k3s.yaml \
  kubectl get secret headlamp-token -n kube-system \
  -o jsonpath='{.data.token}' | base64 -d"
```

Paste it into the Headlamp login screen. Browsers store it in local storage so
you only need to do this once per browser.
