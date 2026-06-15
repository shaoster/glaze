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
# Keep the parent directory but delete only the chart subdirectory so that
# deleted templates don't persist across deploys. Deleting the parent would
# cause `scp -r chart/glaze host:~/glaze-chart-deploy/` to treat the missing
# path as the chart's new name, placing chart contents at ~/glaze-chart-deploy/
# instead of ~/glaze-chart-deploy/glaze/ — breaking the helm path.
CHART_NAME="$(basename "${CHART_DIR}")"
$SSH "${DEPLOY_HOST}" "mkdir -p ~/glaze-chart-deploy && rm -rf ~/glaze-chart-deploy/${CHART_NAME}"
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

  # Deployments to roll sequentially, in order. Each is paused before the
  # helm upgrade so Kubernetes accepts the new spec without immediately
  # starting pods, then resumed one at a time to avoid concurrent memory
  # spikes on the single-core node.
  SEQUENTIAL_DEPLOYMENTS="glaze-web"

  rollout_sequential() {
    echo "==> Pausing deployments before upgrade..."
    for dep in $SEQUENTIAL_DEPLOYMENTS; do
      kubectl rollout pause deployment/$dep -n default 2>/dev/null || true
    done

    echo "==> Applying Helm chart (no wait — rollouts are paused)..."
    # Always resume deployments, even on helm failure, so paused pods don't
    # get stuck. Capture helm's exit code explicitly — set -e doesn't
    # propagate into background subshells so we must track it ourselves.
    helm_exit=0
    helm upgrade --install glaze ~/glaze-chart-deploy/glaze/ \
      -f ~/glaze-values-override.yaml \
      --timeout 5m || helm_exit=$?

    echo "==> Rolling deployments sequentially..."
    for dep in $SEQUENTIAL_DEPLOYMENTS; do
      echo "--- resuming $dep ---"
      kubectl rollout resume deployment/$dep -n default
      if [ "$helm_exit" -eq 0 ]; then
        kubectl rollout status deployment/$dep -n default --timeout=5m
        echo "--- $dep ready ---"
      else
        echo "--- skipping rollout status: helm failed (exit $helm_exit) ---"
      fi
    done

    return $helm_exit
  }

  helm_upgrade() {
    rollout_sequential &
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
