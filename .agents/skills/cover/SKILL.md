---
name: cover
description: Analyze test coverage using bazel coverage and the SQLite-backed coverage audit tool, then generate an issue for coverage improvements. Use when evaluating codebase test health and identifying coverage gaps, redundant overlap, unexpected coverage, or mocking opportunities.
---

# Test Coverage Analysis

Use this skill to assess test coverage and create actionable tasks to improve it.

## Automated Analysis

The coverage-analysis tool ingests raw LCOV output from `bazel-testlogs` into a persistent SQLite database at `.coverage-audit/coverage-audit.sqlite3` in the worktree root. This enables high-performance queries that track:
- **Per-test `CoverageLine` rows**: identify which specific tests hit which lines.
- **Aggregated coverage**: view project-wide health.
- **Redundancy & Overlap**: find lines exercised by too many tests or tests with identical footprints.

**Step 1: Generate Raw Coverage Data**
Run this from the repo root (works in worktrees). It generates individual `coverage.dat` files for every test in `bazel-testlogs`:
```bash
rtk bazel coverage --combined_report=lcov --cache_test_results=false //...
```

Both Python and TypeScript tests produce LCOV output:
- Python targets use `pytest_test()` from `python.bzl`, which injects `--cov` and `--cov-report=lcov` via `select()` on `//:is_coverage_build`.
- Web targets use `vitest_test()` from `web/vitest.bzl`.

**Step 2: Ingest and Analyze**
Run the audit tool. It automatically scans `bazel-testlogs`, builds the database, and performs cross-test analysis:
```bash
bazel run //web:coverage_audit -- summary
```

The sparse schema makes common questions cheap to ask via the following commands:
- `bazel run //web:coverage_audit -- gaps`: Largest uncovered contiguous ranges.
- `bazel run //web:coverage_audit -- redundant`: Lines hit by many tests; candidates for simplification.
- `bazel run //web:coverage_audit -- unexpected`: Tests with broad cross-module reach (non-integration candidates).

Native dependencies like `better-sqlite3` are managed via Bazel lifecycle hooks in `MODULE.bazel`. Do NOT attempt to manually run `pnpm install` or debug missing `.node` bindings; if they are missing, ensure `MODULE.bazel` has the correct `lifecycle_hooks` configured and run `bazel run //web:coverage_audit` to trigger the build.

## Common Query Recipes

- **Coverage gaps**: list files with uncovered lines, surface the largest uncovered contiguous ranges, and prioritize recently changed files that still have zero-hit lines.
- **Redundant coverage**: find lines or files hit by many tests, identify tests with nearly identical source sets, and call out coverage that is duplicated enough to simplify.
- **Unexpected coverage**: look for tests that hit files outside their feature area, or that exercise unrelated modules and components.
- **Mocking opportunities**: treat unusually broad coverage from a non-integration test as a candidate for more mocking and narrower assertions, especially when it fans out across many feature modules.
- **Integration candidates**: if the broad fan-out is intentional and the test is genuinely exercising multiple layers, consider marking the Bazel target as integration coverage instead of forcing it into a unit-test shape.

## Workflow

1. **Generate Coverage Data**
   - Run `rtk bazel coverage --combined_report=lcov --cache_test_results=false //...` from the worktree containing the changes under test.
   - Run `bazel run //web:coverage_audit -- summary` to build the SQLite database.
2. **Analyze**
   - Do not ask the developer for information that can be inferred from the coverage data.
   - If the data is insufficient to support a concrete recommendation, do not create an issue yet.
   - Keep the analysis actionable: identify specific files, lines, functions, or test targets.
   - For non-integration tests, treat broad cross-module coverage as a mocking candidate rather than as desirable integration coverage.
3. **Draft the Issue**
   - Use the `spec-issue` skill to format the findings into a GitHub issue.
   - Include:
     - **Context**: current coverage baseline and the query used to gather it
     - **Provenance**: note that the work came from `/cover`
     - **Scope**: specific modules, files, or test targets
     - **Coverage Gaps**: uncovered files, lines, or functions
     - **Redundant Coverage**: tests or lines that are duplicated enough to simplify
     - **Unexpected Coverage**: tests that reach unrelated modules
     - **Mocking Opportunities**: broad non-integration tests that should be narrowed
     - **Specific Action Items**: concrete edits, not generic "increase coverage" language

## Quality Bar

- Coverage review should assume tests are unit tests first.
- A Bazel target is only treated as integration coverage when it is explicitly tagged `integration`.
- When a non-integration test covers many unrelated components or feature modules, call it out as a mocking candidate.
- When the breadth is intentional, call out the target as an integration-test candidate and tell the user to add `tags = ["integration"]` to the relevant `BUILD.bazel` rule (`vitest_test(...)` under `web/BUILD.bazel`, `pytest_test(...)` under `api/BUILD.bazel`, or the equivalent test rule in the owning package).
- If the data does not support a concrete recommendation, stop and say the coverage data is insufficient instead of filing a vague issue.
