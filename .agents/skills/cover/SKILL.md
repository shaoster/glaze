---
name: cover
description: Analyze test coverage using bazel coverage and generate an issue for coverage improvements. Use when evaluating codebase test health and identifying areas for coverage growth.
---

# Test Coverage Analysis

Use this skill to assess test coverage and create actionable tasks to improve it.

## Automated Analysis

To analyze coverage efficiently without generating unnecessary visual reports:

- Use `rtk bazel coverage` to generate the coverage data.
- Use CLI tools (`grep`, `awk`, `paste`, `sort`, `find`) to parse the LCOV file directly from `bazel-out/_coverage/_coverage_report.dat` or locate per-file coverage reports.
- These commands are pre-approved for automated use within this skill.
- **Prohibited**: Do NOT use `genhtml` or other interactive report-generation tools that create HTML or other visual output, as they are not needed for CLI-based analysis.

1. **Run Coverage**: Execute `rtk bazel coverage --combined_report=lcov --cache_test_results=false //...`.
2. **Review**: Check the summary coverage reports (usually in `bazel-out/_coverage/_coverage_report.dat` or similar). Analyze the file directly for detailed insights. Do not rely solely on the summary report; it may not provide the granularity needed for informed recommendations.
3. **Analyze by File**: Check the individual coverage reports by file (`find -L bazel-testlogs -name "coverage.dat"`). Analyze these files to identify specific modules or files with low coverage, as well as any patterns in uncovered code. Analyze each file individually using command line tools instead of generating an HTML report.
4. **Spec Issue**: Invoke this skill with `/cover` to analyze the results and draft a GitHub issue for coverage improvements, including:
   - High-value modules with low coverage. Categorize by criticality and impact.
   - Suggestions for refactoring dead/uncovered code.
   - Based on per-file coverage analysis, identify low-hanging fruit for increasing coverage via nearby tests.
   - Based on per-file coverage analysis, identify unnecessary tests that could be removed or refactored.

## Workflow

1.  **Generate Coverage Data**:
    ```bash
    rtk bazel coverage --combined_report=lcov --cache_test_results=false //...
    ```
2.  **Analyze & Spec Issue**:
    General principles:
    - Do not ask the developer for information that can be inferred from the coverage data. Instead, use the coverage data to make informed recommendations.
    - This is a test health improvement task and should bear the "test" label.
    - If you do not understand the coverage data or cannot make informed recommendations, do not create an issue. Instead, respond with a message indicating that the coverage data is insufficient for analysis, or that additional tools or expertise may be required to interpret the results effectively.
    - Do not create an issue just to create checkboxes to run and analyze coverage as TODOs. The issue should be actionable and based on insights from the coverage data.
    - For each test file with low coverage, identify specific lines or functions that are not covered and suggest concrete tests that could be added to cover those areas. This should be based on the uncovered lines/functions identified in the coverage data.

    Use the `spec-issue` skill to format the findings into a GitHub issue, referencing `bazel coverage` output. Ensure the issue includes:
    - **Context**: Current coverage baseline.
    - **Provenance**: Indicate that this was triggered by the `/cover` command and based on the analysis of the coverage data.
    - **Scope**: Specific modules or files identified.
    - **Low Hanging Fruit**: Concrete tests that could be added or expanded.
    - **Dead Code**: Modules that could be removed or refactored.
    - **Redundant Tests**: Tests that could be removed or refactored based on coverage analysis.
    - **Specific Action Items**: Specific actions for improving coverage, such as adding tests for uncovered lines/functions or refactoring code to improve testability. Generic "Increase test coverage for module X" is not sufficient; the issue should include specific recommendations based on the coverage data analysis.
