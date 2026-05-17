"""Pytest entry point for Bazel py_test targets.

Bazel's py_test requires a single main script. This file is that script:
it delegates entirely to pytest, passing through any args that Bazel
appends (the test path(s) declared in each BUILD target's `args`).
"""

import os
import sys

import pytest

if __name__ == "__main__":
    extra = []
    cov_file = os.environ.get("COVERAGE_OUTPUT_FILE")
    if cov_file:
        extra = [f"--cov-report=lcov:{cov_file}"]
    sys.exit(pytest.main(["--import-mode=importlib", *extra, *sys.argv[1:]]))
