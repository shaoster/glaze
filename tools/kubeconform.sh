#!/usr/bin/env bash
set -euo pipefail

# Locate the kubeconform binary in runfiles
KUBECONFORM_BIN=""
if [ -n "${TEST_SRCDIR:-}" ]; then
  # Look under the specific Bzlmod repo prefix or search under TEST_SRCDIR
  KUBECONFORM_BIN=$(find "$TEST_SRCDIR" -name "kubeconform" -print -quit || true)
fi

if [ -z "$KUBECONFORM_BIN" ] || [ ! -f "$KUBECONFORM_BIN" ]; then
  # Fallback
  KUBECONFORM_BIN=$(find . -name kubeconform -type f -print -quit)
fi

if [ -z "$KUBECONFORM_BIN" ] || [ ! -f "$KUBECONFORM_BIN" ]; then
  echo "Error: kubeconform binary not found in runfiles" >&2
  exit 1
fi

chmod +x "$KUBECONFORM_BIN"

# Find all yaml files in infra/k3s/ except config.yaml
MANIFESTS=()
for f in infra/k3s/*.yaml; do
  if [ "$(basename "$f")" != "config.yaml" ]; then
    MANIFESTS+=("$f")
  fi
done

echo "==> Running kubeconform on manifests..."
"$KUBECONFORM_BIN" -summary -strict -ignore-missing-schemas "${MANIFESTS[@]}"
