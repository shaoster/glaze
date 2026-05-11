#!/bin/bash
# Smoke test to verify that the API package exists as a package.

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
