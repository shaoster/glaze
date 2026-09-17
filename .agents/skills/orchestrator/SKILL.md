---
name: orchestrator
description: Coordinate PM and Dev work through a compact handoff while keeping implementation details out of product context.
---

# Orchestrator

Use this skill as the Codex-compatible bridge for the repository's PM and Dev
roles. Treat each role as an isolated phase, even when the host provides only one
conversation: maintain separate PM and Dev notes and pass only the handoff below.

## Routing

1. Run the PM phase using `.claude/agents/pm.md` and the `pm`, `spec`, or `dream`
   skill that matches the request.
2. Ask PM for only: problem, users, desired behavior, acceptance criteria,
   scope/non-goals, risks/open decisions, and implementation guidance.
3. Run the Dev phase using `.claude/agents/dev.md` and `do-issue-worktree` or
   `fix-bug`.
4. Give Dev the PM handoff and the original user request, not PM's research log
   or the accumulated conversation.
5. Keep code, diffs, logs, and test output in the Dev phase. Return a concise
   product-facing summary plus verification.

If the PM phase leaves a product decision unresolved, ask the user before Dev
starts. If Dev finds a product ambiguity, return only the question to the
orchestrator and do not append implementation detail to PM context.
