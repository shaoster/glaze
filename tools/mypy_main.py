"""Mypy entry point for Bazel py_test targets.

Runs mypy over the paths passed as argv arguments, with the config file
read from mypy.ini in the workspace root (available via runfiles).
"""

import os
import sys

import mypy.main

if __name__ == "__main__":
    # Bazel sets RUNFILES_DIR; _main is the canonical workspace name.
    runfiles = os.environ.get("RUNFILES_DIR", "")
    if runfiles:
        os.chdir(os.path.join(runfiles, "_main"))
    sys.exit(mypy.main.main(args=sys.argv[1:]))
