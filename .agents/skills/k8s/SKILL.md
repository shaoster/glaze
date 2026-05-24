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

Before running any cluster commands, ask the user:

> What is the SSH target for the production cluster? (e.g. the value of
> `$GLAZE_PROD_HOST` from `.env.local`, or a hostname/IP directly)

Store the answer as `PROD_HOST` for the rest of the session. All `kubectl` and
`helm` commands run over SSH with `KUBECONFIG=/etc/rancher/k3s/k3s.yaml`:

```bash
# Single command
ssh $PROD_HOST "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && kubectl get pods"

# Interactive session
ssh $PROD_HOST
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

If the user has already established the host earlier in the conversation, use
that value — don't ask again.

## TLS termination

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
Tailscale client → tailnet DNS → Tailscale operator LoadBalancer service
                → traefik-tailscale (100.83.6.71:443)
                → Traefik terminates TLS (cert: glaze-admin-tls / headlamp-tls)
                → Django admin / Headlamp
```

- These hostnames resolve to a **Tailscale CGNAT IP** (`100.x.x.x`) that is
  unreachable without Tailscale membership — non-tailnet clients fail before
  Traefik sees the request.
- cert-manager issues certs via **DNS-01** challenge (Cloudflare). HTTP-01
  cannot be used because the ACME server cannot reach a tailnet-only IP.
- `ClusterIssuer`: `letsencrypt-prod` with `dns01.cloudflare` solver, scoped
  to `admin.potterdoc.com` and `headlamp.potterdoc.com` via `selector.dnsNames`.
- ExternalDNS keeps the Cloudflare DNS records pointed at the operator-assigned
  Tailscale service IP. Records must be **DNS-only** (grey cloud in Cloudflare)
  — Cloudflare cannot proxy to a reserved Tailscale IP.
- The Tailscale operator authenticates with Infisical-sourced OAuth credentials
  (`TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET`).

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

## Applying experimental chart changes

```bash
# $PROD_HOST established at session start (see "Connecting to the cluster")

# Copy local chart to node
scp -o StrictHostKeyChecking=no -r chart/glaze "${PROD_HOST}":~/glaze-chart-deploy/

# Run upgrade (reuses existing values-override.yaml on the node)
ssh -o StrictHostKeyChecking=no "${PROD_HOST}" "
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  helm upgrade glaze ~/glaze-chart-deploy/glaze/ \
    -f ~/glaze-values-override.yaml \
    --timeout 5m \
    --wait
"
```

**Important:** the CD pipeline also scp's the chart from git and runs
`helm upgrade`. Any experimental change you apply manually will be **reverted**
by the next CD run unless it is also committed to git.

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
- **Always set `timeoutSeconds: 3`** — never rely on the 1s default
- `initialDelaySeconds` should be ≥ the service's typical cold-start time
- `failureThreshold: 3` with `periodSeconds: 10` gives 30s grace before kill —
  sufficient for transient deploy-time contention
