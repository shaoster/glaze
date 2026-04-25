"""Pytest entry point for Bazel py_test targets.

Bazel's py_test requires a single main script. This file is that script:
it delegates entirely to pytest, passing through any args that Bazel
appends (the test path(s) declared in each BUILD target's `args`).
"""
import sys
import pytest

if __name__ == "__main__":
    sys.exit(pytest.main(["--import-mode=importlib", *sys.argv[1:]]))
