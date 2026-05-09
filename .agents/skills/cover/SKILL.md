---
name: cover
description: Analyze test coverage using bazel coverage and generate an issue for coverage improvements. Use when evaluating codebase test health and identifying areas for coverage growth.
---

# Test Coverage Analysis

Use this skill to assess test coverage and create actionable tasks to improve it.

## Quick Start

1. **Run Coverage**: Execute `rtk bazel coverage --combined_report=lcov //...`.
2. **Review**: Check the summary coverage reports (usually in `bazel-out/_coverage/_coverage_report.dat` or similar).
3. **Analyze by File**: Check the individual coverage reports by file (`find -L bazel-testlogs -name "coverage.dat"`).
4. **Spec Issue**: Invoke this skill with `/cover` to analyze the results and draft a GitHub issue for coverage improvements, including:
   - High-value modules with low coverage. Categorize by criticality and impact.
   - Suggestions for refactoring dead/uncovered code.
   - Based on per-file coverage analysis, identify low-hanging fruit for increasing coverage via nearby tests.
   - Based on per-file coverage analysis, identify unnecessary tests that could be removed or refactored.

## Workflow

1.  **Generate Coverage Data**:
    ```bash
    bazel coverage //...
    ```
2.  **Analyze & Spec Issue**:
    Use the `spec-issue` skill to format the findings into a GitHub issue, referencing `bazel coverage` output. Ensure the issue includes:
    - **Context**: Current coverage baseline.
    - **Scope**: Specific modules or files identified.
    - **Low Hanging Fruit**: Concrete tests that could be added or expanded.
    - **Dead Code**: Modules that could be removed or refactored.
    - **Redundant Tests**: Tests that could be removed or refactored based on coverage analysis.
    - **Success Criteria**: Targeted percentage increase or specific test requirements.
    - The "test" label.
