"""Lint aspects applied via `bazel build --config=lint //...`

Each aspect wraps a linter binary over py_library / js_library targets.
Results are content-addressed: only targets whose source files changed since
the last run are re-checked.

Usage:
    bazel build --config=lint //...          # check everything
    bazel build --config=lint //api/...      # check only api targets
    bazel build --config=lint //web/...      # check only web targets

mypy runs as a standalone py_test (//api:api_mypy) tagged "lint" rather than
as an aspect — see https://github.com/shaoster/glaze/issues/157.
tsc runs as a standalone build target (//web:tsc_check) tagged "lint".
"""

load("@aspect_rules_lint//lint:ruff.bzl", "lint_ruff_aspect")
load("@aspect_rules_lint//lint:eslint.bzl", "lint_eslint_aspect")

# ── Python: ruff (lint + format check) ───────────────────────────────────────
# v2.x ships ruff as a pre-built binary at @aspect_rules_lint//lint:ruff_bin.

ruff_aspect = lint_ruff_aspect(
    binary = "@@aspect_rules_lint~//lint:ruff_bin",
    configs = ["@@//:ruff.toml"],
)

# ── JavaScript/TypeScript: eslint ─────────────────────────────────────────────

eslint_aspect = lint_eslint_aspect(
    binary = "@@//web:eslint_bin",
    configs = ["@@//web:eslint.config.js"],
)
