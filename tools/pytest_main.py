"""Pytest entry point for Bazel py_test targets.

Bazel's py_test requires a single main script. This file is that script:
it delegates entirely to pytest, passing through any args that Bazel
appends (the test path(s) declared in each BUILD target's `args`).
"""

import os
import sys

import pytest

if __name__ == "__main__":
    cov_file = os.environ.get("COVERAGE_OUTPUT_FILE")
    if cov_file:
        import coverage

        # Extract --cov=<src> from Bazel-injected args; pass everything else to pytest
        cov_srcs = [a[6:] for a in sys.argv[1:] if a.startswith("--cov=")]
        pytest_args = [a for a in sys.argv[1:] if not a.startswith("--cov")]

        # Start coverage before pytest (and before Django/conftest imports)
        cov = coverage.Coverage(source_pkgs=cov_srcs or None)
        cov.start()
        ret = pytest.main(["-p", "no:cov", *pytest_args])
        cov.stop()
        cov.save()
        cov.lcov_report(outfile=cov_file)
        sys.exit(ret)
    else:
        sys.exit(pytest.main(["--import-mode=importlib", *sys.argv[1:]]))
