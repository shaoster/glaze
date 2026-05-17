"""Pytest entry point for Bazel py_test targets.

Bazel's py_test requires a single main script. This file is that script:
it delegates entirely to pytest, passing through any args that Bazel
appends (the test path(s) declared in each BUILD target's `args`).

Coverage builds (COVERAGE_OUTPUT_FILE set by `bazel coverage`) use coverage.py
directly instead of the pytest-cov plugin. The plugin's sys.settrace hook races
Django's module loading in Bazel's sandbox, producing no-data-collected warnings.
Driving coverage.Coverage() here — before pytest.main() — starts the tracer early
enough to capture Django app initialization.

--import-mode=importlib is used for normal test runs to prevent Bazel's runfiles
path layout from prepending stale sys.path entries. It is not used for coverage
builds because coverage.py's source_pkgs resolution is incompatible with importlib
module identity (modules imported under importlib mode get a synthetic __spec__.name
that doesn't match the package name passed to source_pkgs).
"""

import os
import sys

import coverage
import pytest

if __name__ == "__main__":
    cov_file = os.environ.get("COVERAGE_OUTPUT_FILE")
    if cov_file:
        # Extract --cov=<pkg> args injected by the pytest_test() macro.
        cov_srcs = [a[6:] for a in sys.argv[1:] if a.startswith("--cov=")]
        pytest_args = [a for a in sys.argv[1:] if not a.startswith("--cov")]

        if not cov_srcs:
            raise RuntimeError(
                "COVERAGE_OUTPUT_FILE is set but no --cov=<pkg> arg was found. "
                "Ensure the pytest_test() macro is used and cov_src is set."
            )

        # data_file=None avoids writing a .coverage file into the Bazel sandbox.
        cov = coverage.Coverage(source_pkgs=cov_srcs, data_file=None)
        cov.start()
        ret = pytest.main(["-p", "no:cov", *pytest_args])
        cov.stop()
        cov.lcov_report(outfile=cov_file)
        sys.exit(ret)
    else:
        sys.exit(pytest.main(["--import-mode=importlib", *sys.argv[1:]]))
