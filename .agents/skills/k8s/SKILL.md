---
name: k8s
created: 2026-05-23
modified: 2026-05-23
reviewed: 2026-05-23
description: |
  Kubernetes cluster ops for Glaze: reading events, probing health,
  diagnosing probe failures, Helm release management, and the convergence rule.
allowed-tools: Bash, Read, WebFetch
---

# Kubernetes Skill

## The convergence rule

**No manual steps. `cd.yml` fully converges.**

Every cluster state that requires a `kubectl` or `helm` command belongs in the
Helm chart or CD pipeline. If you fix something by hand, commit it immediately —
otherwise the next CD run reverts it.

Workflow for any cluster change:

1. Apply experimentally via `scp` + `helm upgrade` (see below)
2. Validate on the live cluster
3. Commit to the Helm chart in the worktree
4. Push, open PR, merge
5. Verify the CD deploy re-applies the same config from git

## Connecting to the cluster

The production SSH target is `$GLAZE_PROD_HOST` from `.env.local`. The default
value is `root@glaze-prod` — a Tailscale MagicDNS hostname. SSH is restricted
to the tailnet; you must be connected to Tailscale and tagged as an
`admin-client`. Tailscale SSH handles auth with no extra keys.

*Note: While local development and manual commands use `$GLAZE_PROD_HOST` from `.env.local`, the CI/CD pipeline in [cd.yml](file:///.github/workflows/cd.yml) resolves the host from the GitHub Action variable `${{ vars.DEPLOY_HOST_TAILSCALE }}`.*

Ask the user for the value if not already established in the conversation, then
store it as `PROD_HOST` for the rest of the session. All `kubectl` and `helm`
commands run over SSH with `KUBECONFIG=/etc/rancher/k3s/k3s.yaml`:

```bash
# Single command
ssh $PROD_HOST "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && kubectl get pods"

# Interactive session
ssh $PROD_HOST
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

If the user has already established the host earlier in the conversation, use
that value — don't ask again.

## TLS termination & Tailnet Ingress Routing

There are two distinct TLS termination paths in this cluster. The ACME solver
used for each is the critical difference — do not mix them up when adding new
hostnames.

### Path 1 — Public traffic (`potterdoc.com`)

```
Internet → public Traefik LoadBalancer (159.223.154.68:443)
         → Traefik terminates TLS (cert: glaze-tls)
         → Django web pod
```

- cert-manager issues the cert via **HTTP-01** challenge through the public
  Traefik `LoadBalancer` service. The ACME server hits
  `http://potterdoc.com/.well-known/acme-challenge/...` on port 80.
- Cloudflare proxies the apex (`potterdoc.com`) — the public IP is
  `159.223.154.68`.
- `ClusterIssuer`: `letsencrypt-prod` with `http01.ingress.class: traefik`.

### Path 2 — Tailnet-only traffic (`admin.potterdoc.com`, `headlamp.potterdoc.com`)

```
Tailscale client → Tailscale IP (100.x.x.x) 
                 → Tailscale Operator Proxy Pod
                 → traefik-tailscale Service (port 9443 / websecure-tailscale)
                 → Traefik terminates TLS (cert: glaze-admin-tls / headlamp-tls)
                 → Django admin / Headlamp
```

#### Tailscale Operator -> ExternalDNS -> Cloudflare Integration
The integration dynamically configures DNS and ingress for tailnet-only subdomains:
1. **Traefik Configuration:** In [traefik.yaml](file:///infra/k3s/traefik.yaml), an additional `tailscale` service (`traefik-tailscale`) is defined with `loadBalancerClass: "tailscale"` and annotated with:
   `external-dns.alpha.kubernetes.io/hostname: "admin.potterdoc.com,headlamp.potterdoc.com"`
2. **Tailscale Proxy Provisioning:** The Tailscale Kubernetes Operator running in the cluster detects this LoadBalancer service, registers a new device in the Tailnet, spawns a Tailscale proxy pod to handle CGNAT routing, and updates the `traefik-tailscale` Service LoadBalancer status with the proxy's `100.x.x.x` CGNAT address.
3. **Cloudflare DNS Records:** ExternalDNS running in the cluster watches the services, extracts the assigned Tailscale IP (`100.x.x.x`) from the service status, and automatically updates Cloudflare DNS records for `admin.potterdoc.com` and `headlamp.potterdoc.com`. These records must be **DNS-only** (grey cloud in Cloudflare) because Cloudflare cannot proxy to private CGNAT IPs.
4. **Secrets Replication:** cert-manager needs `CLOUDFLARE_API_TOKEN` to complete DNS-01 challenges. A `ClusterExternalSecret` named `glaze-cloudflare-token` (managed by the `glaze` Helm chart) replicates this credential from Infisical into the `cert-manager` namespace.

#### Inbound Ingress Routing
- Requests to `admin.potterdoc.com` and `headlamp.potterdoc.com` resolve to the Tailscale proxy's CGNAT IP, failing immediately for non-tailnet clients.
- For authorized tailnet clients, the traffic lands on the operator-managed Tailscale proxy pod, which forwards it to Traefik on port `9443` (the `websecure-tailscale` entrypoint).
- Traefik terminates TLS. The certs are issued by cert-manager's `ClusterIssuer` using the `dns01.cloudflare` solver (as cert-manager cannot reach a tailnet-only IP via HTTP-01).
- Traefik routes the requests using host headers to either the `glaze-web` service (for `admin.potterdoc.com/admin/`) or `headlamp` service (for `headlamp.potterdoc.com`).

### Adding a new hostname — which solver to use

| Hostname reachable from public internet? | Use |
|---|---|
| Yes | HTTP-01 via public Traefik ingress |
| No (tailnet-only) | DNS-01 via Cloudflare; add to `selector.dnsNames` in `clusterissuer.yaml` |

If adding a new tailnet-only hostname, also add it to the
`external-dns.alpha.kubernetes.io/hostname` annotation on the
`traefik-tailscale` service in `infra/k3s/traefik.yaml` so ExternalDNS
creates the Cloudflare record automatically.

## Hitting the health endpoint from within the cluster

`/api/health/ready/` is restricted to the k3s internal network by the
`health-internal-only` Traefik middleware. Django's `SECURE_SSL_REDIRECT` also
redirects plain HTTP requests — so `kubectl exec` into the web pod will fail
with an SSL error or redirect loop.

**Correct approach — curl from the host node using the pod's cluster IP:**

```bash
# $PROD_HOST established at session start (see "Connecting to the cluster")
POD_IP=$(ssh $PROD_HOST \
  "KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get pod \
   -l app.kubernetes.io/name=glaze,app.kubernetes.io/component=web \
   -o jsonpath='{.items[0].status.podIP}'")
ssh $PROD_HOST "curl -s http://${POD_IP}:8000/api/health/ready/"
```

Or exec into a sidecar that has network access (e.g. `glaze-otelcol`) rather
than the web pod itself.

## Reading cluster events

```bash
# All warnings, most recent last
kubectl get events -n default --sort-by='.lastTimestamp' | grep Warning

# Events for a specific pod
kubectl get events --field-selector involvedObject.name=glaze-redis-0 \
  --sort-by='.lastTimestamp' -o wide

# Full event detail including first-seen, last-seen, and count
kubectl get events -n default -o wide --sort-by='.firstTimestamp'
```

**Key fields to correlate:**
- `FIRST SEEN` + `COUNT` + `LAST SEEN` together reveal whether failures are
  sporadic (deploy-coincident) or continuous (real health issue)
- A count of N that matches the number of recent deploys strongly suggests
  deployment-load contention, not a service problem

## Probe diagnosis

### exec probes and fork/exec contention

`exec`-based probes (`redis-cli ping`, `pg_isready`) fork a subprocess inside
the container on every probe cycle. On a single-core node under deployment load
(image pulls, migration jobs, multiple pods starting), this fork/exec can exceed
`timeoutSeconds: 1` (the K8s default), triggering false failures for healthy
services.

**Signs of false probe failures:**
- Probe timeouts occur only during deploys, never during idle operation
- The service itself is healthy when probed manually after the event
- Event `COUNT` matches the number of recent deploys

**Fix: prefer `tcpSocket` over `exec` where possible**

| Service | exec probe | tcpSocket replacement |
|---|---|---|
| Redis | `redis-cli ping` | `tcpSocket: port: 6379` |
| Postgres | `pg_isready -U ...` | `tcpSocket: port: 5432` |

`tcpSocket` has zero subprocess overhead — kubelet opens the socket directly.
A listening socket is sufficient health signal for single-node stateful services.

Always set `timeoutSeconds: 3` explicitly. The default of 1s is too tight for
a loaded single-core node.

### Web probe redirect warnings (`ProbeWarning: Probe terminated redirects`)

Django's `SECURE_SSL_REDIRECT = True` redirects plain HTTP to HTTPS. The web
probes send HTTP with `Host: potterdoc.com`, which Django redirects to
`https://potterdoc.com`. K8s 1.25+ treats cross-scheme redirects as a
`ProbeWarning` (not a failure), so the pod stays healthy but emits noise on
every probe cycle.

Fix: add `SECURE_REDIRECT_EXEMPT = [r"^api/health/"]` to `backend/settings.py`
so the health endpoint responds directly over HTTP.

### Web readiness `context deadline exceeded` on startup

The web readiness probe hits `/api/health/ready/` which checks DB connectivity
and migration state. Django startup (loading settings, connecting to the DB) can
take longer than `initialDelaySeconds: 15` + `timeoutSeconds: 1` on a loaded
node.

This is expected transient behavior during rolling deploys. If it persists after
the pod has been running for >60s, check DB connectivity and migration state.

## Applying experimental chart changes & Sequential Rollouts

The production cluster runs on a single-core, resource-constrained VM. To avoid control-plane thrashing and out-of-memory crashes, **do not run manual `helm upgrade` commands.**

Instead, use [tools/helm_deploy.sh](file:///tools/helm_deploy.sh). This script automates a **sequential rollout strategy**:
1. **Pause Deployments:** It runs `kubectl rollout pause` on the `glaze-web` and `glaze-worker` deployments. This lets Kubernetes accept the new configuration spec without immediately spawning new pods.
2. **Apply Chart:** It runs `helm upgrade --install` to update the manifests.
3. **Sequential Resume:** It resumes the deployments one by one (`kubectl rollout resume`), waiting for each to fully converge (`kubectl rollout status`) before starting the next. This prevents concurrent CPU/memory spikes during rolling restarts.

To run a manual deployment from the workspace:
```bash
# $PROD_HOST established at session start (see "Connecting to the cluster")
# Usage: helm_deploy.sh <deploy_host> <chart_dir> <values_override_file>
tools/helm_deploy.sh "${PROD_HOST}" chart/glaze /tmp/values-override.yaml
```

**Important:** The CD pipeline also copies the chart from Git and runs this script. Any manual changes applied to the cluster will be **reverted** on the next CD run unless committed to Git.

## Helm release management

```bash
# Release history
helm history glaze -n default --max 10

# Current values in use
helm get values glaze -n default

# Diff a local chart against the live release (requires helm-diff plugin)
helm diff upgrade glaze ~/glaze-chart-deploy/glaze/ -f ~/glaze-values-override.yaml

# Roll back a stuck pending-upgrade
helm rollback glaze -n default --wait --timeout 2m
```

## Verifying convergence after a CD deploy

After merging and waiting for the CD job:

1. Check `helm history` — confirm revision number incremented
2. Confirm the live probe/config matches git: `kubectl get <resource> -o json`
3. Scan warning events: `kubectl get events | grep Warning`
4. Check restart counts: `kubectl get pods` — no unexpected restarts
5. No new `Unhealthy` or `ProbeWarning` events since the deploy

## Single-node probe tuning guidelines

This cluster runs on a single-core node. Rules of thumb:

- **Never use `exec` probes for stateful services** — use `tcpSocket` or `httpGet`
- **Always set `timeoutSeconds: 3`** (or more) — never rely on the 1s default
- `initialDelaySeconds` should be ≥ the service's typical cold-start time
- `failureThreshold: 3` with `periodSeconds: 10` gives 30s grace before kill —
  sufficient for transient deploy-time contention

*Note on HelmChartConfig limitations:* K3s `HelmChartConfig` files only apply to resources managed by the k3s Helm controller. They are ineffective for static deployments (like CoreDNS) or standalone Helm charts (like cert-manager). For these resources, [tools/ensure_cluster.sh](file:///tools/ensure_cluster.sh) applies idempotent `kubectl patch` modifications to dynamically raise probe timeouts to 5s.

## DNS Nameserver Deduplication Workaround

DigitalOcean DHCP and Tailscale configurations can push a node's nameserver list past the 3-entry resolver limit, or introduce duplicate resolver entries. This causes pods to emit continuous warnings:
`Nameserver limits were exceeded, some nameservers have been omitted (DNSConfigForming)`

To prevent this:
1. **Static Resolv.conf:** [tools/ensure_cluster.sh](file:///tools/ensure_cluster.sh) creates a static `/etc/k3s-resolv.conf` on the host node containing only the two unique DigitalOcean nameservers (`67.207.67.2` and `67.207.67.3`). Kubelet is configured in `/etc/rancher/k3s/config.yaml` (`resolv-conf=/etc/k3s-resolv.conf`) to read this file instead of dynamic paths.
2. **CoreDNS Override:** A custom CoreDNS override ConfigMap (`coredns-custom`) is applied under `kube-system`, mapping `forward.override` to the two DO DNS hosts to bypass node-level resolver resolution for pod DNS lookup.

## Host Firewall (nftables)

To keep the droplet's public surface small, the host firewall is managed programmatically via `nftables`:
- **Service:** `glaze-host-firewall.service` (systemd unit configured on the node).
- **Rules:** The firewall drops public control-plane traffic (SSH, Kubernetes API server, kubelet API). It accepts incoming packets on loopback (`lo`), Tailscale interface (`tailscale0`), pod networks (`cni0` / `flannel.1`), and public web ports (80 / 443).
- **NodePorts:** NodePort access is blocked by disabling NodePort allocations in the Helm config (`allocateLoadBalancerNodePorts: false`) and dynamically stripping existing ports from the `traefik-tailscale` service in [tools/ensure_cluster.sh](file:///tools/ensure_cluster.sh).
