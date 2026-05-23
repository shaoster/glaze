#!/usr/bin/env bash
set -e
bash -n "${TEST_SRCDIR}/_main/tools/cluster_setup.sh"
echo "cluster_setup.sh: syntax OK"
bash -n "${TEST_SRCDIR}/_main/tools/patch_system_probes.sh"
echo "patch_system_probes.sh: syntax OK"
