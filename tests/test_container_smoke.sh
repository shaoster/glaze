#!/bin/bash
# Smoke test to verify that the API package is importable.
# This script is meant to be run in a context where the project code is available
# (e.g. within a test environment).

python3 -c "import api; print('Successfully imported api module')"
if [ $? -ne 0 ]; then
    echo "Failed to import api module."
    exit 1
fi

if [ ! -f "api/__init__.py" ]; then
    echo "api/__init__.py is missing."
    exit 1
fi
