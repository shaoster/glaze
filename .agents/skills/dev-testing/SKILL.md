---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: dev-testing
description: |
  Glaze test and lint commands: Bazel test/lint targets, individual suite commands,
  auto-fix workflow, web build helper, CI job breakdown, and BUILD.bazel source-slice
  hygiene. Invoke when prepping a PR, running tests, or investigating a CI failure.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Testing and Validation

**All proposed changes must pass the full test suite and all linters before being submitted.**

## CI-Aligned Validation (matches what CI runs)

```bash
# All tests (workflow, backend, web, mypy)
rtk bazel test //...

# All linters: ruff, eslint, tsc, mypy
rtk bazel build --config=lint //...
```

Run `rtk bazel test //...` — it discovers and runs all affected tests automatically.
Do not pick granular targets to save time during iterative debugging. Bazel caches
passing targets, so re-running `//...` after a fix costs no more than running a single target.

## Auto-Fix Before Committing

```bash
source env.sh && gz_format
# equivalent to:
ruff format .
ruff check --fix .
```

Run from the repo root with the venv active. No Bazel-integrated auto-fix step.

## Individual Suites (fast iteration during development)

Prefer Bazel targets — they match CI and benefit from incremental caching.

Before running a granular Bazel test after adding or importing new source files, check
that the target's source slice includes the new dependencies:

```bash
rtk bazel query 'labels(srcs, //web:workflow_state_src)'  # inspect included files
rtk bazel query 'deps(<test-target>)'                     # trace dependencies
```

This matters especially when a page is refactored into a subfolder (`web/src/pages/<PageName>/`):
update the matching `js_library` `srcs` and focused test target inputs at the same time.

```bash
# Workflow schema validation
rtk bazel test //tests:...

# Backend API tests
rtk bazel test //api:api_test

# Backend mypy
rtk bazel test //api:api_mypy

# Web component tests
rtk bazel test //web:web_test
cd web && npm run test:watch     # watch mode (no Bazel equivalent)

# Web type-check + lint
rtk bazel build --config=lint //web/...
# Do not run tsc directly — may not resolve depending on environment setup
```

## Web Build Helper

```bash
source env.sh
gz_build
```

`gz_build` pre-generates TypeScript types then runs `tsc -b && vite build`.

## CI Jobs

Three parallel jobs on every push and PR (see `.github/workflows/ci.yml`):

| Job | What it runs |
|---|---|
| `test` | `rtk bazel test --config=ci //...` — all test suites |
| `lint` | `bazel build --config=ci --config=lint //...` — ruff, eslint, tsc, mypy |
| `coverage` | `bazel coverage --config=ci --combined_report=lcov //...` — feeds Codecov |

A PR should not be merged if any job is red.

## BUILD.bazel Source File Rules

When adding a new source file, check whether the relevant Bazel target picks it up
automatically (glob) or requires a manual `srcs` addition (explicit list).

### Python (`api/`)

| File type | Target | Auto-included? |
|---|---|---|
| Non-test, non-migration `.py` in `api/` | `//api:api_lib` | ✅ glob — no change needed |
| Migration `api/migrations/*.py` | `//api:migrations` | ✅ glob — no change needed |
| New test file `api/tests/test_*.py` | appropriate `py_test` in `api/BUILD.bazel` | ❌ must add to `srcs` |

Determine which `py_test` target to add to by matching the test's concern:

| Test concern | Target |
|---|---|
| Workflow helpers, globals DSL, additional fields | `//api:api_workflow_test` |
| Model factory, globals, utils | `//api:api_model_test` |
| Piece CRUD, state transitions, sealed state | `//api:api_piece_test` |
| Auth (login, logout, Google OAuth) | `//api:api_auth_test` |
| Glaze combination, public library, import tool | `//api:api_glaze_test` |
| Admin, Cloudinary, exports | `//api:api_admin_test` |

### TypeScript (`web/`)

| File type | Target | Auto-included? |
|---|---|---|
| `web/src/util/**/*.ts` (non-test) | `//web:util_lib` | ✅ glob — no change needed |
| `web/src/components/*.tsx` or `web/src/pages/*.tsx` | `//web:web_lib` (build) | ✅ glob — no change needed for builds |
| Same component/page file | fine-grained `*_src` `js_library` (tests) | ❌ must add to appropriate `*_src` target's `srcs` in `web/BUILD.bazel` |
| New `**/*.test.ts` or `**/*.test.tsx` | appropriate `vitest_test` in `web/BUILD.bazel` | ❌ must add to `srcs` |

**Component `*_src` target lookup:** find the `js_library` whose `srcs` already contains
sibling files from the same component group. If the new component has no siblings yet,
create a new `js_library` (following the existing pattern) and a corresponding
`vitest_test` target, then add the new test target to the `web_test` `test_suite`.

Verify Bazel picks up the new file before committing:
```bash
rtk bazel query 'labels(srcs, //api:api_lib)'         # confirm Python file included
rtk bazel query 'labels(srcs, //web:util_lib)'         # confirm util file included
rtk bazel query 'labels(srcs, //web:<component>_src)'  # confirm component file included
```

## Test Locations

- `tests/test_workflow.py` — workflow schema/integrity validation
- `api/tests/` — Django API tests (granular Bazel targets per concern)
- `web/src/components/__tests__/` — React component tests (granular Bazel targets per component)
- `web/src/util/workflow.test.ts` — `workflow.ts` helper unit tests
- `web/src/util/__tests__/api.test.ts` — `api.ts` unit tests (axios mocked)

**Keep tests in their domain-specific file.** Each Bazel target covers one coherent slice.
When adding new tests, extend the existing file covering the same module. Do not create
new cross-cutting files — they end up in catch-all targets that run on every change.
