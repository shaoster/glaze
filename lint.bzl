"""Lint aspects applied via `bazel build --config=lint //...`

Each aspect wraps a linter binary over py_library or js_library targets.
Results are content-addressed: only targets whose source files changed since
the last run are re-checked.

Usage:
    bazel build --config=lint //...          # check everything
    bazel build --config=lint //api/...      # check only api targets
    bazel build --config=lint //web/...      # check only web targets
"""

load("@aspect_rules_lint//lint:ruff.bzl", "lint_ruff_aspect")
load("@aspect_rules_lint//lint:mypy.bzl", "lint_mypy_aspect")
load("@aspect_rules_lint//lint:eslint.bzl", "lint_eslint_aspect")

# ── Python: ruff (lint + format check) ───────────────────────────────────────

ruff_aspect = lint_ruff_aspect(
    binary = "@@//:ruff",
    configs = ["@@//:ruff.toml"],
)

# ── Python: mypy (type-check) ─────────────────────────────────────────────────

mypy_aspect = lint_mypy_aspect(
    binary = "@@//:mypy",
    configs = ["@@//:mypy.ini"],
    # django-stubs and drf-stubs are needed for mypy to resolve Django types.
    deps = [
        "@@pip//django_stubs",
        "@@pip//djangorestframework_stubs",
        "@@pip//types_pyyaml",
        "@@pip//types_requests",
    ],
)

# ── JavaScript/TypeScript: eslint ─────────────────────────────────────────────
# Targets tagged with "lint" are checked; others are skipped.

eslint_aspect = lint_eslint_aspect(
    binary = "@@//web:node_modules/.bin/eslint",
    configs = ["@@//web:eslint.config.js"],
)

# ── TypeScript: tsc --noEmit ──────────────────────────────────────────────────
# aspect_rules_lint does not have a built-in tsc aspect; tsc_check is instead
# declared as a js_run_binary target in //web:BUILD.bazel and run directly via
# `bazel build //web:tsc_check`.

tsc_aspect = None  # placeholder — see //web:tsc_check
