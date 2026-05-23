#!/usr/bin/env bash
# Patches probe timeouts on system components that ship with timeoutSeconds: 1.
# On a single-core node, CPU pressure causes these probes to spuriously fail.
# This script is run via CD on every deploy (kubectl patch is idempotent).
set -e

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

patch_probe_timeout() {
  local ns=$1 deploy=$2 container=$3 timeout=$4
  if ! kubectl get deployment "$deploy" -n "$ns" &>/dev/null; then
    echo "Skipped $ns/$deploy (not found)"
    return 0
  fi
  kubectl patch deployment "$deploy" -n "$ns" --type=strategic-merge-patch -p "{
    \"spec\":{\"template\":{\"spec\":{\"containers\":[{
      \"name\":\"$container\",
      \"livenessProbe\":{\"timeoutSeconds\":$timeout},
      \"readinessProbe\":{\"timeoutSeconds\":$timeout}
    }]}}}}"
  echo "Patched $ns/$deploy (timeoutSeconds=$timeout)"
}

patch_probe_timeout kube-system headlamp headlamp 5
patch_probe_timeout cert-manager cert-manager-webhook cert-manager-webhook 5
patch_probe_timeout kube-system coredns coredns 5
