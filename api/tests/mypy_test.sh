#!/bin/bash
# Wrapper to run mypy while explicitly unsetting coverage variables.
# This prevents the Bazel coverage runner from interfering with mypy's analysis.

# Scrub coverage environment variables
unset COVERAGE_DIR
unset COVERAGE_MANIFEST
unset COVERAGE_OUTPUT_FILE
unset COVERAGE_REPORT_FILE

# Bazel sets RUNFILES_DIR; we need to be in the workspace root.
cd "${RUNFILES_DIR}/_main"

# Execute the mypy binary
./api/api_mypy_bin api/
EXIT_CODE=$?

# Always return the mypy exit code
exit $EXIT_CODE
