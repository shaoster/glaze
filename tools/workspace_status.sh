#!/usr/bin/env bash
# Emits stable status variables consumed by Bazel workspace stamping.
# Used by oci_image labels so docker inspect can read the build commit.
set -euo pipefail

git_sha=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "STABLE_GIT_COMMIT ${git_sha}"
