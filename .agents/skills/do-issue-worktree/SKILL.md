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
/do #292
```

The point is to make the worktree contract impossible to miss. Before analysis,
implementation, tests, or GitHub comments, create an isolated repo-local
worktree and print the path in a copy-friendly form.

## Trigger

Use this skill when the prompt asks to:

- `/do #<issue-number>`
- work on a GitHub issue
- implement a feature branch
- continue a PR in a fresh branch
- start any change that should become its own PR

If the user explicitly asks to work in the current checkout, ask for
confirmation before skipping the worktree.

## Required First Output

Print this before any code changes:

```text
Worktree: /absolute/path/to/glaze/.agent-worktrees/<agent>/issue-<N>-<slug>
```

Keep it on its own line so the developer can copy it or use `gz_cd <pattern>`.

## Flow

1. Read the issue title and body from GitHub.
2. Create a short slug from the issue title.
3. Create the branch as `issue/<N>-<slug>`.
4. Create the worktree at `.agent-worktrees/<agent>/issue-<N>-<slug>`.
5. Announce the absolute worktree path.
6. Continue all analysis, edits, tests, commits, pushes, and PR work from that
   worktree root.

Example:

```bash
git worktree add .agent-worktrees/codex/issue-292-vibe-coding-flow \
  -b issue/292-vibe-coding-flow main
```

Use the agent name that matches the running tool, such as `codex`, `claude`, or
`cursor`.

## Worktree Setup

After creating the worktree:

- Run commands from the worktree root.
- Use `source env.sh && gz_setup` before verification in a new environment.
- Use plain `gz_setup` for the normal shared `.venv` and `web/node_modules`
  flow.
- Use `gz_setup --isolated` only when changing Python or Node dependencies.
- If starting servers manually, open a dedicated terminal tab for that worktree
  and run `gz_start` there.

Do not re-source `env.sh` from a different worktree in an existing terminal that
already has servers running.

## Implementation Rules

- Keep one issue per worktree and one focused branch per issue.
- Do not edit files outside the announced worktree unless the user explicitly
  asks.
- Use the documented Glaze commands from `docs/agents/dev.md`.
- Keep `workflow.yml`, migrations, dependency files, CI, and deployment config
  within the protected-change rules in the agent docs.
- When opening a PR, include `Closes #<N>` in the PR body and apply the agent's
  ownership label.

## Cleanup

Clean up after the PR is merged or the branch is abandoned:

```bash
gz_stop
git worktree remove .agent-worktrees/<agent>/issue-<N>-<slug>
git worktree prune
git branch -d issue/<N>-<slug>
```

Use `git branch -D` only for an abandoned unmerged branch after confirming the
work is no longer needed.

If a local server is still running in the worktree, stop it first with `gz_stop`
from that worktree's terminal. `git worktree remove` should not be forced over
running or dirty worktrees.

## Quick Developer Handoff

When handing the worktree back to the developer, include:

- the worktree path
- the branch name
- any server URL if one was started
- the exact verification command(s) run
- cleanup commands if the PR is merged or abandoned
