#!/usr/bin/env bash
# Converges cluster infrastructure to the state declared in infra/.
# Run via the cluster-setup workflow (infra/** push or manual dispatch).
# Idempotent: safe to re-run at any time.
#
# Usage: cluster_setup.sh <deploy_host>
set -euo pipefail

DEPLOY_HOST="${1:?Usage: cluster_setup.sh <deploy_host>}"
SSH="ssh -o StrictHostKeyChecking=no"
SCP="scp -o StrictHostKeyChecking=no"

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

# ── k3s auto-deploy manifests ────────────────────────────────────────────────
echo "==> Syncing k3s manifests..."
for f in infra/k3s/*.yaml; do
  # config.yaml is a k3s server config, not a Kubernetes manifest.
  [ "$(basename "$f")" = "config.yaml" ] && continue
  $SCP "$f" "${DEPLOY_HOST}":/var/lib/rancher/k3s/server/manifests/"$(basename "$f")"
done

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

# ── System component probe patches ──────────────────────────────────────────
echo "==> Patching system component probe timeouts..."
$SCP tools/patch_system_probes.sh "${DEPLOY_HOST}":/tmp/patch_system_probes.sh
$SSH "${DEPLOY_HOST}" 'bash /tmp/patch_system_probes.sh'

echo "==> Cluster setup complete."
