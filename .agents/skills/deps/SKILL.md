---
name: deps
description: Analyze Glaze Bazel dependencies for the rules_oci final image target, all test targets, and lint targets. Use when the developer invokes /deps or asks to find anomalous, unexpected, overly broad, stale, or suspicious Bazel dependencies in build, test, coverage, lint, OCI image, or rules_oci target graphs.
---

# Dependency Audit

Audit the Bazel dependency graph for unexpected dependencies in the production
image, tests, and lint graph. This is read-only analysis: do not edit files
unless the developer explicitly asks for fixes.

## Scope

Always inspect:

- Final OCI image target: `//:image`
- Push wrapper only when relevant: `//:push`
- All tests: targets discovered by `rtk bazel query 'kind(".*_test rule", //...)'`
- Aggregate test suites: `//api:api_test`, `//web:web_test`, and `//tests:...`
- Lint graph: `rtk bazel build --config=lint //...` shape, plus targets tagged
  `lint`, especially `//web:eslint_check`, `//web:tsc_check`, and `//api:api_mypy`

## Commands

Run from repo root. Use `rtk bazel query` exactly for graph inspection.

```bash
# Final image dependency graph
rtk bazel query 'deps(//:image)'
rtk bazel query 'somepath(//:image, //web:web_build)'
rtk bazel query 'somepath(//:image, //api:api_runtime_files)'
rtk bazel query 'somepath(//:image, //backend:backend_runtime_files)'

# Test and lint target discovery
rtk bazel query 'kind(".*_test rule", //...)'
rtk bazel query 'attr(tags, "lint", //...)'
rtk bazel query 'tests(//...)'

# Dependency breadth checks
rtk bazel query 'rdeps(//..., //api:api_lib, 1)'
rtk bazel query 'rdeps(//..., //web:util_lib, 1)'
rtk bazel query 'rdeps(//..., //web:web_lib, 1)'
rtk bazel query 'rdeps(//..., //:workflow_files, 1)'

# Source ownership spot checks
rtk bazel query 'labels(srcs, //web:web_test_files)'
rtk bazel query 'labels(srcs, //api:api_runtime_files)'
rtk bazel query 'labels(srcs, //web:web_lib)'
```

For large graph comparisons, write query output to `/tmp` and use `sort`,
`comm`, `awk`, and `rg` to summarize. Avoid destructive cleanup commands unless
the developer asks.

## Analysis Checklist

Classify each finding as `expected`, `suspicious`, or `confirmed anomaly`.

Look for:

- **Production image leaks**: test files, fixtures beyond runtime fixtures,
  lint-only tools, dev-only packages, `.mypy_cache`, `node_modules`, `web/src`
  test files, coverage outputs, or stale generated files in `//:image`.
- **Runtime/package leaks**: `//:image` depending on test suites, lint targets,
  mypy, eslint, vitest, pytest-only helpers, or tool binaries not needed at
  runtime.
- **Test graph over-breadth**: focused web tests depending on `//web:web_lib`
  when a narrower `*_src` target exists; API tests depending on unrelated
  runtime modules; cross-layer dependencies that make unrelated changes rerun
  broad suites.
- **Lint graph anomalies**: lint actions traversing `.` or copied output trees
  instead of declared inputs; stale files under `bazel-out` influencing lint;
  lint targets depending on generated or test outputs unexpectedly.
- **Environment leaks**: targets depending on untracked, local, or
  machine-specific files that are not explicitly documented as runtime inputs.
  Prioritize recursive graph leaks such as `.agent-worktrees/**`, `bazel-*`
  output symlinks, copied runfiles, local cache directories, editor state, local
  credentials, and generated scratch files. Do not flag documented `.env*` and
  `web/.env*` inputs merely because they are local; only flag them if they enter
  an unexpected target or layer.
- **Workflow data drift**: targets that read `workflow.yml` without depending on
  `//:workflow_files` or `//:workflow_js`.
- **rules_oci layering surprises**: `python_layer_tar`, `app_src_tar`, or
  `web_dist_tar` pulling more than their documented runtime layer should.

Do not flag broad dependencies that are documented and intentional without
explaining why they are acceptable. Examples that are often expected in Glaze:

- `//:image` depends on `//web:web_build` through `web_dist_tar`.
- `//:image` depends on `//api:api_runtime_files` and
  `//backend:backend_runtime_files` through `app_src_tar`.
- `//web` test targets depend on `//web:util_lib` for shared API/types/workflow
  helpers.
- Backend tests depend on `//:workflow_files`, migrations, fixtures, and static
  files through shared test data.

## Output

Return a concise report:

```markdown
## Summary
- <one-line overall result>

## Confirmed Anomalies
- `<target>` depends on `<unexpected target/file>` via `<path>`.
  Impact: <why it matters>.
  Suggested fix: <specific owner/module/BUILD change>.

## Suspicious / Needs Owner Decision
- ...

## Expected Broad Dependencies
- ...

## Commands Run
- `rtk bazel query ...`
```

If the audit should become GitHub work, draft an issue with:

- exact target labels
- reproduction commands
- shortest dependency path from `somepath(...)` when available
- concrete acceptance criteria
