#!/bin/bash
set -e

# If arguments are passed to the entrypoint, execute them instead of starting gunicorn
if [ $# -gt 0 ]; then
    exec /appcontainer_entrypoint "$@"
fi

# Launch the hermetic Bazel-built Python entrypoint instead of shelling out to
# the host interpreter.
exec /appcontainer_entrypoint
