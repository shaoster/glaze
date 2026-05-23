#!/usr/bin/env bash
set -e
bash -n "${TEST_SRCDIR}/_main/tools/ensure_cluster.sh"
echo "ensure_cluster.sh: syntax OK"
