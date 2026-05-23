#!/usr/bin/env bash
# Deploys the glaze Helm chart to the k3s cluster.
# Handles stuck pending releases, retries on transient failures,
# and prints pod/event context on failure.
#
# Usage: helm_deploy.sh <deploy_host> <chart_dir> <values_override_file>
set -euo pipefail

DEPLOY_HOST="${1:?Usage: helm_deploy.sh <deploy_host> <chart_dir> <values_override_file>}"
CHART_DIR="${2:?chart_dir required}"
VALUES_FILE="${3:?values_override_file required}"

SSH="ssh -o StrictHostKeyChecking=no"
SCP="scp -o StrictHostKeyChecking=no"

echo "==> Copying chart and values to ${DEPLOY_HOST}..."
$SCP -r "${CHART_DIR}" "${DEPLOY_HOST}":~/glaze-chart-deploy/
$SCP "${VALUES_FILE}" "${DEPLOY_HOST}":~/glaze-values-override.yaml

echo "==> Deploying via Helm..."
$SSH "${DEPLOY_HOST}" << 'ENDSSH'
  set -e
  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

  # If a previous deploy was cancelled mid-flight, Helm leaves the release in
  # pending-upgrade and refuses all subsequent operations. Roll back to clear.
  helm_status=$(helm status glaze -n default -o json 2>/dev/null \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["info"]["status"])' \
    2>/dev/null || echo "")
  if [[ "$helm_status" == *pending* ]]; then
    echo "Helm release stuck in '$helm_status' — rolling back to clear lock..."
    helm rollback glaze -n default --wait --timeout 2m
  fi

  helm_upgrade() {
    helm upgrade --install glaze ~/glaze-chart-deploy/glaze/ \
      -f ~/glaze-values-override.yaml \
      --timeout 5m \
      --wait &
    HELM_PID=$!

    while kill -0 $HELM_PID 2>/dev/null; do
      sleep 15
      echo '--- pod status ---'
      kubectl get pods -n default --no-headers \
        | grep -v ' Running \| Completed \| Succeeded ' || echo '  (all pods nominal)'
      echo '--- recent events ---'
      kubectl get events -n default --sort-by=.lastTimestamp \
        | grep -v Normal | tail -5 || true
    done

    wait $HELM_PID
  }

  show_failure_context() {
    echo '=== DEPLOY FAILED: pod detail ==='
    kubectl get pods -n default
    echo '=== unhealthy pod logs (last 30 lines each) ==='
    kubectl get pods -n default --no-headers \
      | grep -v ' Running \| Completed \| Succeeded ' \
      | awk '{print $1}' \
      | while read pod; do
          echo "--- $pod ---"
          kubectl logs "$pod" -n default --tail=30 2>/dev/null \
            || kubectl describe pod "$pod" -n default | tail -20
        done
    echo '=== warning events ==='
    kubectl get events -n default --sort-by=.lastTimestamp \
      | grep -v Normal | tail -20
  }

  # Retry up to 3 times — transient I/O pressure on single-core node can
  # occasionally cause API server timeouts mid-rollout.
  for attempt in 1 2 3; do
    if helm_upgrade; then
      break
    fi
    show_failure_context
    if [ "$attempt" -lt 3 ]; then
      echo "Helm attempt $attempt failed, retrying in 30s..."
      sleep 30
    else
      exit 1
    fi
  done
ENDSSH

echo "==> Helm deploy complete."
