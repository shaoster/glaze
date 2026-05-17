---
model: opus
created: 2026-05-17
modified: 2026-05-17
reviewed: 2026-05-17
name: docs-human
description: |
  Assess and update human-facing documentation (READMEs) based on codebase state
  or recent changes. Explains the documentation strategy (what goes where) and
  invokes /do to apply updates.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Human-Facing Documentation Strategy

Glaze uses domain-specific READMEs to keep documentation focused and maintainable.

## What Goes Where

- **`README.md` (Root)**: High-level overview, project motivation, quick-start setup instructions, core CLI commands (`env.sh` helpers), and a table of contents to domain-specific READMEs. No deep technical implementation details. Includes a pointer to the published Storybook component documentation.
- **`api/README.md`**: Backend API conventions, Django/DRF specifics, models, public libraries, Auth flows (Google OAuth, Session), data isolation rules, and Swagger UI API exploration.
- **`web/README.md`**: Frontend client conventions, React components, Vite configuration, Storybook (how to run `gz_story` or `bazel run //web:storybook_dev` and write stories), Cloudinary uploads, and showcase view logic.
- **`tests/README.md`**: Common and cross-cutting tests, specifically structural tests for the workflow state machine (`workflow.schema.yml` validation).
- **`tools/README.md`**: Standalone utilities, Modal crop offloading, and the Glaze import tool.
- **`pages/README.md`**: Static published pages (e.g. index generation).
- **`.github/README.md`**: CI/CD infrastructure, GitHub Actions workflows (`ci.yml`, `cd.yml`, `static.yml`), and deployment pipelines.

## Workflow

1. **Assess Divergence**: 
   - Find the commit that last updated the documentation stamp file: `DOCS_SYNC_SHA=$(git log -n 1 --format=%H -- .agents/skills/docs-human/LAST_ANALYSIS_STAMP)`
   - Run `git log --stat ${DOCS_SYNC_SHA}..HEAD` to concretely identify what codebase changes occurred since the last sync. (We use this git log strategy because it is completely robust against squash-merges and concurrent PRs — the exact content of the stamp file doesn't matter, only the commit that touched it last on `main`).
   - Compare those changes against the current state of the relevant `README.md` files, `workflow.yml`, or agent documentation (`docs/agents/`).
   - Ensure that new frontend components have accompanying `.stories.tsx` coverage and are documented appropriately. 
   - Ensure that new or changed API endpoints are documented with DRF `@extend_schema` decorators so they appear correctly in the Swagger UI.
2. **List Updates**: Formulate a concise list of missing, outdated, or misplaced documentation based strictly on the divergence.
3. **Invoke Execution**: For the identified updates, invoke the `/do` skill to create a branch, write the documentation changes, and open a PR. For example: "I have identified the following docs divergences... I will now use `/do` to update them."
4. **Execution Strategy (Tracking Stamp)**: To mark a documentation update as complete, the agent MUST "touch" the stamp file in its PR.
   - Run `date -u +"%Y-%m-%dT%H:%M:%SZ" > .agents/skills/docs-human/LAST_ANALYSIS_STAMP`
   - Include this file modification in the same commit as the documentation updates. The file's content is arbitrary; changing it ensures that `git log` on the next run will find this new commit.
5. **Iteration Strategy**: If you iterate on the PR (e.g., adding new commits to address review feedback), you MUST ensure the stamp file modification is in the *very last* commit of the PR branch. If a repository uses a "rebase and merge" (non-squash) strategy, an early stamp commit will cause the PR's subsequent commits to be incorrectly flagged as "new" changes in the next analysis. Use `git commit --amend` or interactive rebase (`git rebase -i`) to guarantee the stamp file is touched by the final commit in the PR.
