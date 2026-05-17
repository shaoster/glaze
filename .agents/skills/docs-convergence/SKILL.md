---
name: docs-convergence
description: |
  Reconcile duplicated human-facing documentation after a structural change.
  Use when the root README, package READMEs, agent docs, or skill docs drift and
  need to be brought back into alignment without changing product behavior.
allowed-tools: Bash, Read, Edit, Grep, Glob
---

# Docs Convergence

Use this skill when a doc refactor or content move leaves multiple files out of sync.

## Trigger

Use when the task is to:

- Move content between the root README, package READMEs, `docs/agents/`, or skill docs
- Restore GitHub homepage precedence by removing a conflicting README
- Eliminate duplicated or contradictory guidance after a docs restructure

## Workflow

1. Identify the canonical home for each topic.
2. Update downstream links and references to point at that canonical file.
3. Remove or rename any file that would cause GitHub or agents to pick the wrong source.
4. Re-read the affected docs together and make sure terminology matches.
5. If `docs-human` is part of the change, touch `LAST_ANALYSIS_STAMP` in the final commit.

## Default Source Order

- Root README for product overview and top-level navigation
- Package READMEs for scoped backend, frontend, tests, tools, or pages content
- `docs/agents/` for agent workflow guidance
- `.agents/skills/` for agent-internal procedures
