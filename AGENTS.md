# Glaze — Agent Guide

`PotterDoc` is the external product name. `glaze` remains the internal name for code, paths, and docs.

Use American English throughout — "behavior", "initialize", "labeled", "analyze".

---

## Git Worktree Policy

Always create a repo-local worktree before implementing any issue or feature branch.
Use `.agent-worktrees/{agent-name}/{branch}` under the repo root. Announce the absolute
path before any code changes:

```
Worktree: /home/phil/code/glaze/.agent-worktrees/claude/issue-123-fix-foo
```

Use `git worktree add .agent-worktrees/claude/issue-<N>-<slug> -b issue/<N>-<slug> main`.
The user has `gz_cd <pattern>` to navigate there.

When operating inside an existing worktree, managing multiple worktrees, or recovering
from branch contamination, read `docs/agents/worktrees.md`.

## Instruction Priority

When a skill specifies setup, test, build, or verification commands, use those exactly.
Do not substitute equivalent commands or skip wrapper scripts unless the documented
command fails. State any deviation explicitly.

## Key Invariants

- `workflow.yml` is the single source of truth for states and transitions — never hardcode state names or transition rules anywhere
- `PieceState` history is append-only — past states cannot be edited; only `current_state` is writable
- Public library objects (`user=NULL`) are managed via Django admin only — regular API users cannot create, edit, or delete them
- `POST /api/pieces/` always initializes a piece in the `designed` state
- State names and transitions must be derived from `workflow.yml` on both backend and frontend

## Scope Limits — Ask Before Acting

- Modifying `workflow.yml` (state definitions, transitions, successors)
- Modifying `.github/workflows/` (CI/CD configuration)
- Adding or removing Python dependencies (`requirements*.txt`)
- Adding or removing npm dependencies (`package.json`)
- Writing or altering database migrations
- Modifying `backend/settings.py`, `build.sh`, or other deployment configuration

---

## Agent Resources

Four user-invocable skills: `/do` (implement an issue), `/spec` (draft and file a new issue), `/audit` (test performance audit), and `/cover` (analyze test coverage).

All other resources are loaded on demand via the `Read` tool. Load what the task touches —
typically 2–4 files. The `/do` flow scouts dependencies and announces which to load.

Use bazel query to scout dependencies and determine which skills are relevant:

```bash
# Find which target owns a changed file
bazel query 'attr(srcs, "api/views.py", //...)'
bazel query 'attr(srcs, "web/src/components/Foo.tsx", //...)'

# Find what immediately depends on a target (depth 1 avoids the always-true
# openapi_schema transitive chain — use this to spot genuine cross-layer deps)
bazel query 'rdeps(//..., //api:api_lib, 1)'
bazel query 'rdeps(//..., //web:util_lib, 1)'

# On an existing branch: map all changed files to targets in one query
bazel query "rdeps(//..., set(\$(git diff --name-only main | sed 's/.*/\"&\"/' | tr '\n' ' ')), 1)"
```

| Task | Read |
|---|---|
| Workflow state machine, globals DSL, `workflow.yml` changes | [`.agents/skills/glaze-workflow/SKILL.md`](.agents/skills/glaze-workflow/SKILL.md) |
| Backend: Glaze models, API endpoints, image FK, admin, Cloudinary | [`.agents/skills/glaze-backend/SKILL.md`](.agents/skills/glaze-backend/SKILL.md) |
| Frontend: Glaze components, type pipeline, state chips, Cloudinary upload | [`.agents/skills/glaze-frontend/SKILL.md`](.agents/skills/glaze-frontend/SKILL.md) |
| Django/DRF: serializers, auth, user isolation, CORS, production settings | [`.agents/skills/django-api/SKILL.md`](.agents/skills/django-api/SKILL.md) |
| Django admin: custom widgets, inlines, static files, FK wrapping | [`.agents/skills/django-admin/SKILL.md`](.agents/skills/django-admin/SKILL.md) |
| React: component patterns, state shape, reducer migration, MUI conventions | [`.agents/skills/react-conventions/SKILL.md`](.agents/skills/react-conventions/SKILL.md) |
| Frontend testing: async assertions, mock boundaries, Autocomplete wrappers | [`.agents/skills/react-testing/SKILL.md`](.agents/skills/react-testing/SKILL.md) |
| Opening PRs, issue bodies, DoD checklist, branch naming, scope limits | [`.agents/skills/github-pr/SKILL.md`](.agents/skills/github-pr/SKILL.md) |
| Modifying ci.yml, cd.yml, or static.yml | [`.agents/skills/github-actions/SKILL.md`](.agents/skills/github-actions/SKILL.md) |
| Dev environment setup, shell bootstrap, worktree navigation, server info | [`.agents/skills/dev-environment/SKILL.md`](.agents/skills/dev-environment/SKILL.md) |
| Running tests, Bazel commands, linters, CI failures | [`.agents/skills/dev-testing/SKILL.md`](.agents/skills/dev-testing/SKILL.md) |
| Adding Python or npm packages, lock files, BUILD.bazel | [`.agents/skills/dev-packages/SKILL.md`](.agents/skills/dev-packages/SKILL.md) |
| Bazel build optimization, remote caching, .bazelrc | [`.agents/skills/bazel-build-optimization/SKILL.md`](.agents/skills/bazel-build-optimization/SKILL.md) |

## What Goes Where (for editing agent docs)

| File | Contents |
|---|---|
| [`docs/agents/glaze-domain.md`](docs/agents/glaze-domain.md) | Glaze-specific domain: state machine, DSL, data model, backend/frontend conventions, component inventory, API endpoints |
| [`docs/agents/django-drf-python.md`](docs/agents/django-drf-python.md) | Generic Django + DRF conventions reusable in any project |
| [`docs/agents/typescript-react-vite.md`](docs/agents/typescript-react-vite.md) | Generic React + TypeScript + Vite conventions reusable in any project |
| [`docs/agents/github-interactions.md`](docs/agents/github-interactions.md) | Generic GitHub agent conventions reusable in any project |
| [`docs/agents/dev.md`](docs/agents/dev.md) | Glaze-specific dev setup, test commands, CI configuration |
| [`docs/agents/worktrees.md`](docs/agents/worktrees.md) | Git worktree policy, single vs multi-issue workflows, and environment recovery |
| [`.agents/skills/*/SKILL.md`](.agents/skills) | Agent-loadable resources — granular reference docs loaded on demand via `Read` |
| [`.claude/do.md`](.claude/do.md), [`.claude/spec.md`](.claude/spec.md), [`.claude/audit.md`](.claude/audit.md), [`.claude/cover.md`](.claude/cover.md) | User-invocable skills only — everything else has no `.claude/` symlink |
