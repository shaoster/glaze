# k3s Cluster Bootstrap

This directory contains the configuration for the production k3s cluster running on the DigitalOcean droplet.
The current production layout is single-node, so the firewall guidance below
assumes the control plane, workloads, and ingress all live on one host.

## Cluster Specs

- **Provider**: DigitalOcean (1 vCPU, 1 GB RAM minimum — 2 GB recommended)
- **k3s version**: v1.35.4+k3s1
- **Ingress**: Traefik v3 (bundled with k3s, customized via `traefik.yaml`)
- **TLS**: cert-manager v1.20.2 with Let's Encrypt
- **Tailnet ingress**: Tailscale Kubernetes Operator + ExternalDNS

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

The config disables the bundled metrics-server and caps API server request concurrency to reduce memory pressure on 1 GB nodes. Traefik now uses the k3s LoadBalancer path for the public site, while the tailnet-only admin/headlamp front door is handled separately by the Tailscale operator.

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

### 4. Install the Tailscale operator and ExternalDNS

The tailnet-facing admin/headlamp front door is managed by a Tailscale operator-backed LoadBalancer service. The shared Infisical `ClusterSecretStore` is bootstrapped from `infra/k3s/secretstore.yaml`, so the operator and ExternalDNS can consume Infisical secrets before the app chart is installed.

Install the operator first, then ExternalDNS so Cloudflare records can follow the operator-assigned Tailscale IP automatically.

The operator expects OAuth client credentials from Infisical under the keys `TAILSCALE_OAUTH_CLIENT_ID` and `TAILSCALE_OAUTH_CLIENT_SECRET`. ExternalDNS reuses the existing Infisical Cloudflare token at `CLOUDFLARE_API_TOKEN`.

In the Tailscale tailnet policy, create `tag:k8s-operator` and `tag:k8s`, then make `tag:k8s-operator` the owner of `tag:k8s`. If we ever expose other Tailscale-managed services with a different tag, add that tag there too.

Apply the manifests that live alongside this README:

```bash
scp infra/k3s/secretstore.yaml root@<droplet>:/var/lib/rancher/k3s/server/manifests/secretstore.yaml
scp infra/k3s/tailscale-operator.yaml root@<droplet>:/var/lib/rancher/k3s/server/manifests/tailscale-operator.yaml
scp infra/k3s/external-dns.yaml root@<droplet>:/var/lib/rancher/k3s/server/manifests/external-dns.yaml
```

Then verify the operator-assigned service IPs:

```bash
kubectl get svc -n kube-system traefik -o wide
kubectl get svc -n kube-system traefik-tailscale -o wide
```

The `traefik` service is the public front door; `traefik-tailscale` is the tailnet-only front door. ExternalDNS keeps `admin.potterdoc.com` and `headlamp.potterdoc.com` pointed at the `traefik-tailscale` service IP. The bootstrap script waits for `traefik-tailscale` to report `TailscaleProxyReady=True` and publish a `100.x` address before CD proceeds, so the tailnet path is ready before the app deploy continues.
The packet path for both tailnet-only hosts is: browser on an authorized Tailscale client -> tailnet DNS record -> Tailscale operator-managed Traefik `LoadBalancer` service -> Traefik ingress -> Django admin or Headlamp.
Requests that are not coming from tailnet-authorized clients never reach Traefik on those hostnames because the Tailscale service IP is not routable outside the tailnet.

### 5. Install cert-manager

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

### 6. Create the glaze-secrets Secret

This must be done manually before the first `helm install`. Never commit secrets to SCM.

```bash
kubectl create secret generic glaze-secrets \
  --from-literal=POSTGRES_PASSWORD=<value> \
  --from-literal=SECRET_KEY=<value> \
  --from-literal=CLOUDINARY_API_KEY=<value> \
  --from-literal=CLOUDINARY_API_SECRET=<value> \
  --from-literal=EMAIL_HOST_PASSWORD=<value> \
  --from-literal=GRAFANA_CLOUD_INSTANCE_ID=<value> \
  --from-literal=GRAFANA_CLOUD_OTLP_TOKEN=<value> \
  --from-literal=MODAL_AUTH_TOKEN=<value> \
  --from-literal=GOOGLE_OAUTH_CLIENT_SECRET=<value> \
  --from-literal=DROPBOX_APP_KEY=<value> \
  --from-literal=DROPBOX_APP_SECRET=<value> \
  --from-literal=DROPBOX_REFRESH_TOKEN=<value>
```

The CD pipeline updates this secret automatically on each deploy via `kubectl apply`.

### 7. Enable automated database backups

The Helm chart includes an hourly PostgreSQL backup CronJob. It uses the official
`postgres:17` image to create the dump, restore it into a temporary local Postgres
instance, verify that the restore contains nonzero `auth_user` and `api_piece`
rows, and then upload the dump to Dropbox using a digest-based path. Backups are
pruned to a 30-day retention window by default.

Set up a Dropbox app with scoped access, app-folder access, `files.content.write`
and `files.metadata.read`, then provide the app key, app secret, and refresh token
through the `glaze-secrets` secret above.

### 8. Authenticate with GHCR

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

### 9. Deploy the application

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

The Django Admin (`admin.potterdoc.com/admin/`) and Headlamp (`headlamp.potterdoc.com`) are only reachable through the tailnet-facing Traefik service that the Tailscale operator manages. The public site continues to use the normal public Traefik service.

### Packet paths

#### Tailnet client -> `admin.potterdoc.com/admin/`
1. A Tailscale-authorized admin client resolves `admin.potterdoc.com` to the operator-managed Tailscale service IP.
2. The packet enters the Tailscale tunnel and lands on the `traefik-tailscale` service.
3. The Tailscale operator forwards the request to Traefik.
4. Traefik matches the `admin.potterdoc.com` ingress and routes the request to Django admin.
5. cert-manager uses Cloudflare DNS-01 for `admin.potterdoc.com`, so TLS issuance and renewal do not depend on a public HTTP challenge reaching the droplet.

#### Non-tailnet client -> `admin.potterdoc.com/admin/`
1. The client resolves `admin.potterdoc.com` to the same operator-managed Tailscale service IP.
2. Without Tailscale membership, the client cannot reach that IP.
3. The request fails before Traefik sees it.

#### Tailnet client -> `headlamp.potterdoc.com/`
1. A Tailscale-authorized admin client resolves `headlamp.potterdoc.com` to the operator-managed Tailscale service IP.
2. The packet enters the Tailscale tunnel and lands on `traefik-tailscale`.
3. The Tailscale operator forwards the request to Traefik.
4. Traefik routes the request to Headlamp.
5. cert-manager uses Cloudflare DNS-01 for `headlamp.potterdoc.com`, so TLS issuance and renewal do not depend on a public HTTP challenge reaching the droplet.

#### Non-tailnet client -> `headlamp.potterdoc.com/`
1. The client resolves `headlamp.potterdoc.com` to the same operator-managed Tailscale service IP.
2. Without Tailscale membership, the client cannot reach that IP.
3. The request fails before Traefik sees it.

#### Any client -> `potterdoc.com` or `www.potterdoc.com`
1. The client resolves the public apex or `www` records to the droplet's public IP.
2. The request enters the public Traefik `LoadBalancer` service.
3. Traefik routes to the public app ingress as usual.

### DNS records (Cloudflare)

| Hostname | Points to | Proxy |
|---|---|---|
| `admin.potterdoc.com` | Operator-assigned Tailscale service IP | DNS only |
| `headlamp.potterdoc.com` | Operator-assigned Tailscale service IP | DNS only |
| `potterdoc.com` | `159.223.154.68` (public IP) | Proxied |
| `www.potterdoc.com` | `159.223.154.68` (public IP) | Proxied |

### Django Admin
Available at `https://admin.potterdoc.com/admin/`. Connect to Tailscale before
accessing it. The public apex no longer exposes a separate admin ingress, so the
admin host is the canonical browser entrypoint.

The admin subdomain also proxies `/static/` to the web service so Django's
admin CSS and JS can load from WhiteNoise. If the admin page starts showing
missing admin assets again, check the `admin.potterdoc.com` ingress and the
`/static/` path rules together.

### Headlamp
Available at `https://headlamp.potterdoc.com/`. Connect to Tailscale before
accessing. The Cloudflare DNS record is managed automatically by ExternalDNS
and must remain DNS-only (grey cloud) — Cloudflare cannot proxy to a reserved
Tailscale IP.

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
