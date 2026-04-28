# Glaze — Agent Guide

`PotterDoc` is the external product/brand name. `glaze` remains the internal repository and project name for code, paths, and internal documentation unless a task explicitly changes those identifiers too.

@docs/agents/glaze-domain.md
@docs/agents/django-drf-python.md
@docs/agents/typescript-react-vite.md
@docs/agents/github-interactions.md
@docs/agents/dev.md

---

## Git Worktree Policy

When asked to work on a PR or implement a feature branch, always create a git worktree first using the `EnterWorktree` tool rather than modifying the current branch directly. Ask before proceeding if worktree creation would be inappropriate (e.g. the user explicitly wants to work on the current branch).
Prefer repo-local worktree roots over system temp directories: use `.agent-worktrees/` under the repo so the worktree stays near the shared repo bootstrap, secrets fallback, and editable files without colliding with tool-reserved paths like `.codex`.

## Instruction Priority

When a referenced agent doc specifies setup, test, build, or verification commands, use those documented commands exactly by default.
Do not substitute "equivalent" commands or skip wrapper scripts unless the documented command is blocked or fails in the current environment.
If you must deviate, say so explicitly in your user update and final response, including why the documented command could not be used.

## What goes where

Agent documentation is split across five files so that the generic stack guides can be reused in other projects without modification. When editing or adding documentation, put content in the right file:

| File | Contents |
|---|---|
| [`docs/agents/glaze-domain.md`](docs/agents/glaze-domain.md) | Everything specific to this project: the workflow state machine, `additional_fields` DSL, data model, key constraints, and Glaze-specific conventions layered on top of each stack (Django model patterns, frontend module aliases, component inventory, Cloudinary/OAuth flows, protected files, project-specific DoD checks). |
| [`docs/agents/django-drf-python.md`](docs/agents/django-drf-python.md) | Generic Django + DRF conventions reusable in any project: serializer rules, CORS setup, session auth, user-isolation patterns, test approach. No Glaze-specific models, endpoints, or admin customization. |
| [`docs/agents/typescript-react-vite.md`](docs/agents/typescript-react-vite.md) | Generic React + TypeScript + Vite conventions reusable in any project: MUI usage, strict TS rules, theming tokens, Axios usage, async test patterns. No Glaze-specific components, aliases, or data pipelines. |
| [`docs/agents/github-interactions.md`](docs/agents/github-interactions.md) | Generic GitHub agent conventions reusable in any project: `--body-file` pattern, branch naming, scope-limit categories, PR ownership labels, definition-of-done checklist. No Glaze-specific file paths. |
| [`docs/agents/dev.md`](docs/agents/dev.md) | Glaze-specific development setup and test commands: how to start the backend and web, all three test suites, CI configuration, and the per-layer "what to test" checklist. |
