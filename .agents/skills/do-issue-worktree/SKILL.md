---
model: opus
created: 2026-05-07
modified: 2026-05-07
reviewed: 2026-05-07
name: do-issue-worktree
description: |
  Start new issue or PR work with an explicit /do #<issue-number> flow. Use when
  a developer asks an agent to implement a GitHub issue, continue a PR, or start
  a feature branch and the first action must be creating and announcing a
  repo-local worktree.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Do Issue Worktree

Use this skill for the explicit Glaze agent invocation:

```text
/do #42
```

The point is to make the worktree contract impossible to miss. Before analysis,
implementation, tests, or GitHub comments, you MUST use Plan mode for research
and design. Only after the plan is approved and the worktree is created should
implementation begin.

## Mandatory Enforcement

For any session initialized with the `/do` skill:
1. **Plan Mode First:** You MUST use `enter_plan_mode` to research the issue and design the solution before any write operations or worktree creation.
2. **Issue Commenting:** Post the approved plan as a comment on the linked issue. One agent session MUST own exactly one comment; update the same comment for refinements.
3. **Verify your location:** You MUST be within `.agent-worktrees/` before executing ANY write operation.
4. **Implementation Delegation:** If sub-agent capability is available, you MUST delegate the implementation to a sub-agent spawned inside the worktree.
5. **Prohibition:** Modifying the `main` workspace branch is strictly forbidden.

## Trigger

Use this skill when the prompt asks to:

- `/do #<issue-number>`
- work on a GitHub issue
- implement a feature branch
- continue a PR in a fresh branch
- start any change that should become its own PR

If the user explicitly asks to work in the current checkout, ask for
confirmation before skipping the worktree.

## Flow

1. **Research & Design (Plan Mode):**
   - Immediately use `enter_plan_mode`.
   - Read the issue title and body from GitHub.
   - **Dependency scout** — use Bazel to confirm which layers the issue touches (see Scouting Queries below).
   - Formulate a detailed plan including implementation steps and testing strategy.
   - Present the plan to the user for approval.

2. **Issue Commenting:**
   - Once the plan is approved, post it as a comment on the linked issue.
   - Use a hidden marker `<!-- glaze-agent-plan -->` at the end of the comment for UI discoverability.
   - **Persistence:** Store the created comment ID in your session memory. For any subsequent plan refinements in the same session, use this ID with `gh issue comment --edit <id>` to update the existing comment rather than creating a new one.

3. **Worktree Creation:**
   - Create a short slug from the issue title.
   - Create the branch as `issue/<N>-slug`.
   - Create the worktree at `.agent-worktrees/<agent>/issue-<N>-slug`.
   - **Print the worktree path** on its own line:
     ```text
     Worktree: /absolute/path/to/glaze/.agent-worktrees/<agent>/issue-<N>-slug
     ```

4. **Delegation:**
   - If `invoke_agent` is available, spawn a `generalist` or `codebase_investigator` sub-agent, or whichever agent type is allowed to make local branch changes and submit PRs.
   - **Prompt:** Provide the distilled plan, the absolute worktree path, and instructions to ONLY work within that worktree.
   - If delegation is not possible, continue analysis and implementation from within the worktree.

## Scouting Queries

   | Target | What it covers |
   |---|---|
   | `//:workflow_files` | `workflow.yml` + `workflow.schema.yml` — Python data dep |
   | `//:workflow_js` | `workflow.yml` — frontend JS dep |
   | `//api:api_lib` | All non-test, non-migration `.py` files in `api/` |
   | `//web:util_lib` | `web/src/util/**/*.ts` (excluding tests + generated-types) |
   | `//web:web_lib` | All web source files — the build target |
   | `//web:generated_types` | TypeScript types generated from the OpenAPI schema |
   | `//web:openapi_schema` | OpenAPI JSON generated from Django; always rdeps on `//api:api_lib` |

   ### Scouting queries

   ```bash
   # Find which target owns a changed file
   rtk bazel query 'attr(srcs, "api/views.py", //...)'
   rtk bazel query 'attr(srcs, "web/src/components/Foo.tsx", //...)'

   # Check whether workflow.yml is in the change set
   # If yes → invoke /glaze-workflow unconditionally
   rtk bazel query 'rdeps(//..., //:workflow_files)'
   rtk bazel query 'rdeps(//..., //:workflow_js)'

   # Find what immediately depends on a target (depth 1 avoids the always-true
   # openapi_schema transitive chain — use this to spot genuine cross-layer deps)
   rtk bazel query 'rdeps(//..., //api:api_lib, 1)'
   rtk bazel query 'rdeps(//..., //web:util_lib, 1)'

   # On an existing branch: map all changed files to targets in one query
   rtk bazel query "rdeps(//..., set($(git diff --name-only main | sed 's/.*/"&"/' | tr '\n' ' ')), 1)"

   # When depth-1 rdeps is ambiguous, find the exact dependency path
   rtk bazel query 'somepath(//api:api_lib, //web:openapi_schema)'
   ```

   ### Dispatch rules

   | Signal | Read |
   |---|---|
   | `workflow.yml` in the change set | `glaze-workflow` unconditionally |
   | Files under `api/` (non-test, non-migration) | `glaze-backend` + `django-api` |
   | Backend change also adds/removes serializer fields | add `glaze-frontend` (type pipeline regeneration needed) |
   | Files only under `web/src/` | `glaze-frontend` + `react-conventions` |
   | Django admin widgets or inlines | add `django-admin` |
   | Frontend tests needed | add `react-testing` |
   | Adding/removing packages | add `dev-packages` |
   | Any PR | add `github-pr` + `dev-testing` |

   All resources live under `.agents/skills/<name>/SKILL.md`. Load them with the `Read` tool.

   `//web:openapi_schema` always rdeps on `//api:api_lib` (schema is generated from
   Django), so a full transitive rdeps query will always show frontend impact. Use
   depth-1 rdeps or check whether serializer fields actually changed to avoid
   spuriously loading frontend resources for backend-only fixes.

Example:

```bash
git worktree add .agent-worktrees/codex/issue-292-vibe-coding-flow \
  -b issue/292-vibe-coding-flow main
```

Use the agent name that matches the running tool, such as `codex`, `claude`, or
`cursor`.

## After Creating the Worktree

Run all subsequent commands from the worktree root. Invoke `/dev-environment`
if environment setup is needed. Do not edit files outside the worktree unless
the user explicitly asks.

## Handoff

When returning control to the developer, include: worktree path, branch name,
verification commands run, and — if the PR is merged or abandoned — the cleanup
commands from `/dev-environment`.
