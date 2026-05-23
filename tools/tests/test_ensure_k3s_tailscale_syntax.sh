#!/usr/bin/env bash
set -e
bash -n "${TEST_SRCDIR}/_main/tools/ensure_k3s_tailscale.sh"
echo "ensure_k3s_tailscale.sh: syntax OK"
