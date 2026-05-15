#!/bin/bash
# Smoke test to verify that the API package exists as a package.
#
# Representative of the prod container: python:3.12-slim runs `python manage.py`
# with PYTHONPATH=/app, no venv. We mirror that here with a vanilla `python3` +
# PYTHONPATH=.
#
# Gotcha: if a shell with an activated aspect_rules_py venv (e.g. .manage.venv)
# invokes `bazel test`, the venv's `bin/python3` — a runfiles shim that only
# resolves inside its own runfiles tree — can leak onto PATH and surface as
# `Unable to identify an interpreter for venv Runfiles { ... }` here. Run from
# a non-activated shell, or strip the venv from PATH before invoking bazel.

export PYTHONPATH=$PYTHONPATH:.

# We can't import api.models without Django configuration, but we can verify the directory
# is a package by checking for __init__.py and importing the package root itself.

python3 -c "import api; print('Successfully imported api module')"
if [ $? -ne 0 ]; then
    echo "Failed to import api module."
    exit 1
fi

if [ ! -f "api/__init__.py" ]; then
    echo "api/__init__.py is missing."
    exit 1
fi
