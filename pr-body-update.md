Refactors the documentation structure to be more maintainable and easier for AI agents to navigate.

- Splits the monolithic `README.md` into domain-specific files (`api/README.md`, `web/README.md`, `tests/README.md`, `tools/README.md`).
- Updates the root `README.md` to be a high-level overview and index.
- Merges the `issue/503-storybook` changes and adds Storybook guidance to the agent skills (`react-conventions`).
- Updates agent workflows (`github-interactions.md`, `glaze-domain.md`, `github-pr` skill) to reference the new domain-specific README strategy.
- Stages and includes previously unstaged improvements on `main` (e.g. `api/auth_views.py` schema documentation, `.github/README.md`).
- Adds a new `docs-human` agent skill to help maintain these files.

**Execution Strategy (Two-Commit PR)**: This PR contains exactly two commits:

1. The actual documentation updates.
2. A tracking update stamping the SHA of the first commit into `.agents/skills/docs-human/LAST_ANALYSIS_SHA`.

**Reviewer Instruction**: Please **do not squash on merge**. Use a merge commit or rebase merge so that the exact SHA stamped in the tracking commit is preserved in the main branch history.

Closes #506
