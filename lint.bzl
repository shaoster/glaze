"""Lint aspects applied via `bazel build --config=lint //...`

Usage:
    bazel build --config=lint //...          # check everything
    bazel build --config=lint //api/...      # check only api targets
    bazel build --config=lint //web/...      # check only web targets

ruff runs as an aspect over py_library targets (//api:api_lib, //backend:backend_lib).
eslint runs as a standalone target (//web:eslint_check) tagged "lint" — the aspect
  form does not work with js_library targets; the standalone target runs eslint over
  the full web/ directory with the correct working directory and config.
mypy runs as a standalone py_test (//api:api_mypy) tagged "lint" — see
  https://github.com/shaoster/glaze/issues/157.
tsc runs as a standalone build target (//web:tsc_check) tagged "lint".
"""

load("@aspect_rules_lint//lint:ruff.bzl", "lint_ruff_aspect")

# ── Python: ruff (lint + format check) ───────────────────────────────────────
# v2.x ships ruff as a pre-built binary at @aspect_rules_lint//lint:ruff_bin.

ruff_aspect = lint_ruff_aspect(
    binary = "@@aspect_rules_lint~//lint:ruff_bin",
    configs = ["@@//:ruff.toml"],
)
