"""Mypy entry point for Bazel py_test targets.

Runs mypy over the paths passed as argv arguments, with the config file
read from mypy.ini in the workspace root (available via runfiles).
"""

import os
import sys

import mypy.main

if __name__ == "__main__":
    # Scrub coverage environment variables to prevent the coverage runner
    # from interfering with mypy's analysis or the mypy process itself.
    for key in list(os.environ.keys()):
        if key.startswith("COVERAGE_"):
            del os.environ[key]

    # Bazel sets RUNFILES_DIR; _main is the canonical workspace name.
    runfiles = os.environ.get("RUNFILES_DIR", "")
    if runfiles:
        os.chdir(os.path.join(runfiles, "_main"))
    sys.exit(mypy.main.main(args=sys.argv[1:]))
