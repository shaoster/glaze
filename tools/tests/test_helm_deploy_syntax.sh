#!/usr/bin/env bash
set -e
bash -n "${TEST_SRCDIR}/_main/tools/helm_deploy.sh"
echo "helm_deploy.sh: syntax OK"
