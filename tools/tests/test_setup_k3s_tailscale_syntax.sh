#!/usr/bin/env bash
set -e
bash -n "${TEST_SRCDIR}/_main/tools/setup_k3s_tailscale.sh"
echo "setup_k3s_tailscale.sh: syntax OK"
