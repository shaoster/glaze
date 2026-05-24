#!/usr/bin/env bash
# Ensures the cluster is fully ready to accept a Helm deploy.
#
# CONTRACT: when this script exits 0, the following are all true:
#   1. /etc/k3s-resolv.conf exists with the two unique DO nameservers
#   2. k3s is running with the config declared in infra/k3s/config.yaml
#   3. All k3s auto-deploy manifests (ESO HelmChart, HelmChartConfig overrides,
#      cert-manager, headlamp, etc.) are present on the node
#   4. External Secrets Operator is installed and its deployment is rollout-ready
#   5. The Infisical machine identity is present as the infisical-auth Secret
#   6. glaze-secrets exists in the default namespace (ESO has synced from Infisical)
#   7. traefik-tailscale is ready and has an assigned Tailscale IP
#   8. host firewall drops public control-plane traffic (SSH, kube API, kubelet)
#   9. traefik-tailscale service has no NodePort (websecure-tailscale is only
#      reachable via the Tailscale VIP, not via the public node IP)
#
# Idempotent: each step is a no-op when already converged. Safe to run on every
# deploy — fast on a healthy cluster, self-healing on a degraded one.
#
# Usage: ensure_cluster.sh <deploy_host>
set -euo pipefail

DEPLOY_HOST="${1:?Usage: ensure_cluster.sh <deploy_host>}"
SSH="ssh -o StrictHostKeyChecking=no"
SCP="scp -o StrictHostKeyChecking=no"
# ── host firewall ────────────────────────────────────────────────────────────
# Keep the host's public surface intentionally small. The app edge remains
# reachable on 80/443; SSH and cluster administration use Tailscale.
echo "==> Converging host firewall..."
$SSH "${DEPLOY_HOST}" 'bash -s' <<'ENDSSH'
set -euo pipefail

if ! command -v nft >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y nftables
fi

cat > /etc/glaze-host-firewall.nft <<'EOF'
table inet glaze_host_firewall {
  chain input {
    type filter hook input priority -100; policy accept;

    iif "lo" accept
    ct state established,related accept

    # Private administration and Kubernetes-internal traffic.
    iif "tailscale0" accept
    iifname { "cni0", "flannel.1" } accept

    # Public app ingress.
    tcp dport { 80, 443 } accept

    # Everything else on the host INPUT path: public kube API, kubelet, etc.
    # NOTE: NodePort traffic is NOT blocked here — kube-proxy DNAT in
    # PREROUTING rewrites the destination before INPUT is evaluated, so
    # NodePort packets traverse FORWARD, not INPUT. NodePort exposure is
    # prevented by allocateLoadBalancerNodePorts: false + the convergence
    # step in ensure_cluster.sh, not by this firewall rule.
    counter drop
  }
}
EOF

cat > /usr/local/sbin/glaze-host-firewall-apply <<'EOF'
#!/usr/bin/env sh
set -eu

if /usr/sbin/nft list table inet glaze_host_firewall >/dev/null 2>&1; then
  /usr/sbin/nft delete table inet glaze_host_firewall
fi

exec /usr/sbin/nft -f /etc/glaze-host-firewall.nft
EOF
chmod 0755 /usr/local/sbin/glaze-host-firewall-apply

cat > /etc/systemd/system/glaze-host-firewall.service <<'EOF'
[Unit]
Description=Glaze host firewall
Documentation=https://github.com/shaoster/glaze
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/glaze-host-firewall-apply
ExecReload=/usr/local/sbin/glaze-host-firewall-apply

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable glaze-host-firewall.service
systemctl restart glaze-host-firewall.service
nft list table inet glaze_host_firewall >/dev/null
ENDSSH

# ── static kubelet resolv.conf ───────────────────────────────────────────────
# Write /etc/k3s-resolv.conf with only the two unique DO nameservers.
# See infra/k3s/config.yaml for why neither dynamic path is safe to use.
echo "==> Writing /etc/k3s-resolv.conf..."
$SSH "${DEPLOY_HOST}" 'cat > /etc/k3s-resolv.conf <<EOF
nameserver 67.207.67.2
nameserver 67.207.67.3
EOF'

# ── k3s server config ────────────────────────────────────────────────────────
echo "==> Syncing k3s server config..."
$SCP infra/k3s/config.yaml "${DEPLOY_HOST}":/tmp/k3s-config-new.yaml
$SSH "${DEPLOY_HOST}" '
  set -e
  if ! cmp -s /tmp/k3s-config-new.yaml /etc/rancher/k3s/config.yaml; then
    echo "k3s config changed — applying and restarting k3s..."
    cp /tmp/k3s-config-new.yaml /etc/rancher/k3s/config.yaml
    systemctl restart k3s
    echo "Waiting for k3s API to come back..."
    for i in $(seq 1 30); do
      KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get nodes &>/dev/null && break
      [ $i -eq 30 ] && echo "ERROR: k3s did not recover after restart" && exit 1
      sleep 5
    done
    echo "k3s restarted and ready."
  else
    echo "k3s config unchanged — skipping restart."
  fi
'

# ── Clean up stale manifests/configs ─────────────────────────────────────────
echo "==> Cleaning up stale probe-timeouts manifest and configs..."
$SSH "${DEPLOY_HOST}" '
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  rm -f /var/lib/rancher/k3s/server/manifests/probe-timeouts.yaml
  kubectl delete helmchartconfig cert-manager coredns -n kube-system --ignore-not-found
'

# ── k3s auto-deploy manifests ────────────────────────────────────────────────
echo "==> Syncing k3s manifests..."
manifest_apply_args=""
for f in infra/k3s/*.yaml; do
  # config.yaml is a k3s server config, not a Kubernetes manifest.
  [ "$(basename "$f")" = "config.yaml" ] && continue
  dest="/var/lib/rancher/k3s/server/manifests/$(basename "$f")"
  $SCP "$f" "${DEPLOY_HOST}:${dest}"
  manifest_apply_args="${manifest_apply_args} -f ${dest}"
done
# kubectl apply in addition to SCP so HelmChart resources converge immediately
# regardless of whether the k3s file watcher fires.
# shellcheck disable=SC2086
$SSH "${DEPLOY_HOST}" "KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl apply ${manifest_apply_args}"

# ── Wait for Traefik Helm install ─────────────────────────────────────────────
echo "==> Waiting for Traefik Helm install..."
$SSH "${DEPLOY_HOST}" '
  set -e
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  kubectl wait job/helm-install-traefik -n kube-system \
    --for=condition=complete --timeout=180s 2>/dev/null || true
  kubectl rollout status deployment/traefik \
    -n kube-system --timeout=120s
  echo "Traefik is ready."
'

# ── Converge traefik-tailscale NodePort ───────────────────────────────────────
# allocateLoadBalancerNodePorts: false in the Helm values prevents fresh
# allocation, but Kubernetes preserves previously-allocated NodePorts across
# Helm upgrades even with that flag set. Remove it explicitly so the port is
# never reachable on the public node IP.
echo "==> Ensuring traefik-tailscale has no NodePort..."
$SSH "${DEPLOY_HOST}" '
  set -e
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  # Build a JSON patch removing nodePort from every port that has one,
  # identified by name so the patch stays correct if ports are added/reordered.
  patch=$(
    kubectl get svc traefik-tailscale -n kube-system -o json | python3 -c "
import json, sys
svc = json.load(sys.stdin)
ops = []
for i, p in enumerate(svc[\"spec\"][\"ports\"]):
    if \"nodePort\" in p:
        ops.append({\"op\": \"remove\", \"path\": f\"/spec/ports/{i}/nodePort\"})
ops.append({\"op\": \"add\", \"path\": \"/spec/allocateLoadBalancerNodePorts\", \"value\": False})
print(json.dumps(ops))
" 2>/dev/null || true)
  # ops list contains at least the allocateLoadBalancerNodePorts add, so it is
  # always non-empty; only apply if any nodePort entries were found.
  if echo "$patch" | python3 -c "import json,sys; ops=json.load(sys.stdin); exit(0 if any(o[\"op\"]==\"remove\" for o in ops) else 1)" 2>/dev/null; then
    echo "Removing stale NodePorts from traefik-tailscale..."
    kubectl patch svc traefik-tailscale -n kube-system --type=json -p "$patch"
    echo "NodePorts removed."
  else
    echo "No NodePorts present — nothing to do."
  fi
'

# ── ESO credentials ──────────────────────────────────────────────────────────
# Infisical machine identity for External Secrets Operator.
# These are only required once per cluster but safe to re-apply.
INFISICAL_CLIENT_ID="${INFISICAL_CLIENT_ID:?INFISICAL_CLIENT_ID must be set}"
INFISICAL_CLIENT_SECRET="${INFISICAL_CLIENT_SECRET:?INFISICAL_CLIENT_SECRET must be set}"

echo "==> Bootstrapping ESO credentials..."
CLIENT_ID_B64=$(printf '%s' "${INFISICAL_CLIENT_ID}" | base64 -w0)
CLIENT_SECRET_B64=$(printf '%s' "${INFISICAL_CLIENT_SECRET}" | base64 -w0)
printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: infisical-auth\ntype: Opaque\ndata:\n  clientId: %s\n  clientSecret: %s\n' \
  "${CLIENT_ID_B64}" "${CLIENT_SECRET_B64}" | \
$SSH "${DEPLOY_HOST}" 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl apply -f -'

# ── Wait for ESO to be ready ─────────────────────────────────────────────────
echo "==> Waiting for ESO HelmChart install job..."
$SSH "${DEPLOY_HOST}" '
  set -e
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  kubectl wait --for=condition=complete \
    job/helm-install-external-secrets -n kube-system \
    --timeout=180s 2>/dev/null || true
  kubectl rollout status deployment/external-secrets \
    -n external-secrets --timeout=120s
  echo "ESO is ready."
'

echo "==> Bootstrapping shared Infisical ClusterSecretStore..."
$SSH "${DEPLOY_HOST}" '
  set -e
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  kubectl apply -f /var/lib/rancher/k3s/server/manifests/secretstore.yaml
'

# ── Wait for glaze-secrets (contract item 6) ─────────────────────────────────
# The Helm pre-upgrade hook (deploy-init job) needs glaze-secrets to exist
# before it runs. ESO creates it after applying the ExternalSecret resource,
# which happens as part of the Helm release — so this must be polled here,
# after ESO is confirmed ready, not inside helm_deploy.sh.
echo "==> Waiting for glaze-secrets to be synced from Infisical..."
$SSH "${DEPLOY_HOST}" '
  set -e
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  for i in $(seq 1 36); do
    kubectl get secret glaze-secrets -n default &>/dev/null && break
    [ $i -eq 36 ] && echo "ERROR: glaze-secrets not synced after 3m" && exit 1
    eso_status=$(kubectl get externalsecret glaze-secrets -n default \
      -o jsonpath="{.status.conditions[0].message}" 2>/dev/null \
      || echo "ExternalSecret not yet applied")
    echo "  [$i/36] $eso_status"
    sleep 5
  done
  echo "glaze-secrets is ready."
'

# ── Wait for the tailnet front door to be ready ─────────────────────────────
echo "==> Waiting for traefik-tailscale to be ready..."
$SSH "${DEPLOY_HOST}" '
  set -e
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  for i in $(seq 1 36); do
    ready=$(kubectl get svc traefik-tailscale -n kube-system \
      -o jsonpath="{.status.conditions[?(@.type==\"TailscaleProxyReady\")].status}" \
      2>/dev/null || true)
    ip=$(kubectl get svc traefik-tailscale -n kube-system \
      -o jsonpath="{.status.loadBalancer.ingress[0].ip}" \
      2>/dev/null || true)
    hostname=$(kubectl get svc traefik-tailscale -n kube-system \
      -o jsonpath="{.status.loadBalancer.ingress[0].hostname}" \
      2>/dev/null || true)
    if [ "$ready" = "True" ] && [ -n "${ip}${hostname}" ]; then
      echo "traefik-tailscale is ready: ${ip:-<no-ip>} ${hostname:-<no-hostname>}"
      break
    fi
    [ $i -eq 36 ] && echo "ERROR: traefik-tailscale not ready after 3m" && exit 1
    echo "  [$i/36] ready=${ready:-<missing>} ip=${ip:-<missing>} hostname=${hostname:-<missing>}"
    sleep 5
  done
'

# ── Tune component probe timeouts ────────────────────────────────────────────
echo "==> Tuning CoreDNS probe timeouts..."
$SSH "${DEPLOY_HOST}" '
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  if kubectl get deployment coredns -n kube-system &>/dev/null; then
    timeout=$(kubectl get deployment coredns -n kube-system -o jsonpath="{.spec.template.spec.containers[0].livenessProbe.timeoutSeconds}" 2>/dev/null || echo "1")
    if [ "$timeout" -ne 5 ]; then
      echo "Patching coredns deployment probe timeouts to 5s..."
      kubectl patch deployment coredns -n kube-system --type="json" -p="[{\"op\": \"replace\", \"path\": \"/spec/template/spec/containers/0/livenessProbe/timeoutSeconds\", \"value\": 5}, {\"op\": \"replace\", \"path\": \"/spec/template/spec/containers/0/readinessProbe/timeoutSeconds\", \"value\": 5}]"
    else
      echo "coredns probe timeouts are already 5s."
    fi
  fi
'

echo "==> Tuning cert-manager-webhook probe timeouts..."
$SSH "${DEPLOY_HOST}" '
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  if kubectl get deployment cert-manager-webhook -n cert-manager &>/dev/null; then
    timeout=$(kubectl get deployment cert-manager-webhook -n cert-manager -o jsonpath="{.spec.template.spec.containers[0].livenessProbe.timeoutSeconds}" 2>/dev/null || echo "1")
    if [ "$timeout" -ne 5 ]; then
      echo "Patching cert-manager-webhook deployment probe timeouts to 5s..."
      kubectl patch deployment cert-manager-webhook -n cert-manager --type="json" -p="[{\"op\": \"replace\", \"path\": \"/spec/template/spec/containers/0/livenessProbe/timeoutSeconds\", \"value\": 5}, {\"op\": \"replace\", \"path\": \"/spec/template/spec/containers/0/readinessProbe/timeoutSeconds\", \"value\": 5}]"
    else
      echo "cert-manager-webhook probe timeouts are already 5s."
    fi
  fi
'

echo "==> Cluster ready."
