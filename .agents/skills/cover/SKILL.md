---
name: cover
description: Analyze test coverage using bazel coverage and the SQLite-backed coverage audit tool, then generate an issue for coverage improvements. Use when evaluating codebase test health and identifying coverage gaps, redundant overlap, unexpected coverage, or mocking opportunities.
---

# Test Coverage Analysis

Use this skill to assess test coverage and create actionable tasks to improve it.

## Automated Analysis

Use the new coverage-analysis tool to turn LCOV output into a temporary `.gitignored` SQLite database, then query the database instead of scraping raw LCOV by hand. The sparse schema should make the common questions cheap to ask:

- Build and query the database with `bazel run //web:coverage_audit -- summary`

- source files
- source lines
- per-test `CoverageLine` rows
- a combined coverage view for aggregate queries

Generate the raw coverage data with `rtk bazel coverage --combined_report=lcov --cache_test_results=false //...`, then load the per-test reports into the coverage-analysis tool. Avoid `genhtml` and other interactive report-generation tools; they add noise without improving the analysis.

## Common Query Recipes

- **Coverage gaps**: list files with uncovered lines, surface the largest uncovered contiguous ranges, and prioritize recently changed files that still have zero-hit lines.
- **Redundant coverage**: find lines or files hit by many tests, identify tests with nearly identical source sets, and call out coverage that is duplicated enough to simplify.
- **Unexpected coverage**: look for tests that hit files outside their feature area, or that exercise unrelated modules and components.
- **Mocking opportunities**: treat unusually broad coverage from a non-integration test as a candidate for more mocking and narrower assertions, especially when it fans out across many feature modules.

## Workflow

1. **Generate Coverage Data**
   - Run `rtk bazel coverage --combined_report=lcov --cache_test_results=false //...`.
   - Load the per-test LCOV into the coverage-analysis tool and use the database for all follow-up queries.
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
- If the data does not support a concrete recommendation, stop and say the coverage data is insufficient instead of filing a vague issue.
