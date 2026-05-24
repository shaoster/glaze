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
#
# Idempotent: each step is a no-op when already converged. Safe to run on every
# deploy — fast on a healthy cluster, self-healing on a degraded one.
#
# Usage: ensure_cluster.sh <deploy_host>
set -euo pipefail

DEPLOY_HOST="${1:?Usage: ensure_cluster.sh <deploy_host>}"
SSH="ssh -o StrictHostKeyChecking=no"
SCP="scp -o StrictHostKeyChecking=no"
INFISICAL_PROJECT_SLUG="${INFISICAL_PROJECT_SLUG:?INFISICAL_PROJECT_SLUG must be set}"

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

# ── Infisical ClusterSecretStore ─────────────────────────────────────────────
echo "==> Applying shared Infisical ClusterSecretStore..."
$SSH "${DEPLOY_HOST}" 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl apply -f -' <<EOF
apiVersion: external-secrets.io/v1
kind: ClusterSecretStore
metadata:
  name: infisical
spec:
  provider:
    infisical:
      auth:
        universalAuthCredentials:
          clientId:
            name: infisical-auth
            namespace: default
            key: clientId
          clientSecret:
            name: infisical-auth
            namespace: default
            key: clientSecret
      secretsScope:
        projectSlug: "${INFISICAL_PROJECT_SLUG}"
        environmentSlug: "prod"
        recursive: false
EOF

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

echo "==> Cluster ready."
