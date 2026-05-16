Use the coverage workflow in [`.agents/skills/cover/SKILL.md`](../../.agents/skills/cover/SKILL.md).
The workflow now uses `bazel run //web:coverage_audit -- summary` to turn LCOV output into a temporary SQLite database, and it treats broad coverage in non-integration tests as a mocking candidate.
