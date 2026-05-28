---
model: opus
created: 2026-05-28
modified: 2026-05-28
reviewed: 2026-05-28
name: fix-bug
description: |
  Implement a bug fix for a filed GitHub issue. Mirrors /do structurally but
  mandates: (1) write a failing regression test first, (2) implement the fix,
  (3) confirm the regression test passes, (4) open a PR. Use when an issue
  already has validated reproduction steps (produced by /report or equivalent).
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Fix Bug

Use this skill for:

```text
/fix #42
```

The issue **must already have reproduction steps** — either filed by `/report`
or written by the developer. If the issue lacks concrete repro steps, run
`/report` first to establish them before proceeding here.

## Mandatory Enforcement

1. **Plan Mode First:** Use `enter_plan_mode` to research the issue and design
   the fix before any write operations or worktree creation.
2. **Regression test before fix:** The first code written MUST be a failing test
   that encodes the reproduction steps. The fix comes after.
3. **Verify your location:** MUST be within `.agent-worktrees/` before ANY write
   operation.
4. **Issue Commenting:** Post the approved plan as a comment on the issue.
   One agent session owns exactly one comment; update it with `gh issue comment
   --edit <id>` for refinements.
5. **Prohibition:** Modifying the `main` workspace branch is strictly forbidden.

## Flow

### 1. Research & Design (Plan Mode)

Immediately use `enter_plan_mode`.

- Read the issue: title, body, and all comments.
- Confirm reproduction steps are present. If absent, stop and ask the user
  to run `/report #<N>` first.
- **Dependency scout** — use Bazel to confirm which layers the fix touches:

  ```bash
  # Find which target owns a file
  rtk bazel query 'attr(srcs, "api/views.py", //...)'
  rtk bazel query 'attr(srcs, "web/src/components/Foo.tsx", //...)'

  # What immediately depends on a target
  rtk bazel query 'rdeps(//..., //api:api_lib, 1)'
  rtk bazel query 'rdeps(//..., //web:util_lib, 1)'
  ```

  Load the relevant skill(s):

  | Signal | Read |
  |---|---|
  | `workflow.yml` implicated | `glaze-workflow` unconditionally |
  | Files under `api/` | `glaze-backend` + `django-api` |
  | Backend change adds/removes serializer fields | add `glaze-frontend` |
  | Files only under `web/src/` | `glaze-frontend` + `react-conventions` |
  | Django admin widgets or inlines | add `django-admin` |
  | Any PR | add `github-pr` + `dev-testing` |

- **Locate the fault** — read the implicated code and identify the precise
  line(s) responsible. If the issue names a preliminary root cause, verify it.

- **Design the regression test** — describe exactly which test file, test name,
  and assertion will fail before the fix and pass after. Prefer:
  - Backend: a Django test that calls the affected view or model method directly
  - Frontend: a React Testing Library test that renders the component and
    asserts the wrong behavior

- **Design the fix** — smallest change that makes the regression test pass
  without breaking existing tests. No refactoring beyond what the fix requires.

- **Security surface scan** — before presenting the plan, check each planned
  change for security-sensitive items and label with **[SECURITY]**:
  - Auth/authorization changes, new tokens, data-access scope changes,
    new API response fields, email/OAuth changes, Django security settings

- Present the plan to the user for approval.

### 2. Issue Commenting

Once the plan is approved, post it as a comment on the issue:

```bash
gh issue comment <N> --body-file /tmp/plan.md
# store the returned comment ID for updates
```

Use hidden marker `<!-- glaze-agent-fix -->` at the end. Store the comment ID
for `gh issue comment --edit <id>` on refinements.

### 3. Worktree Creation

```bash
git worktree add .agent-worktrees/claude/issue-<N>-<slug> \
  -b issue/<N>-<slug> main
```

Print the worktree path on its own line:
```
Worktree: /absolute/path/to/glaze/.agent-worktrees/claude/issue-<N>-<slug>
```

All subsequent commands run from the worktree root.

### 4. Write the Failing Regression Test

**This step happens before any fix code.** Write the test, run it, and confirm
it fails for the right reason.

```bash
# Run the new test only — confirm it fails
rtk bazel test //<target>:<test> --test_output=all 2>&1 | tail -60
```

The test must:
- Use the exact reproduction steps from the issue
- Fail with an assertion that names the wrong behavior (not a crash or import
  error — those indicate a test setup problem, not a repro)
- Be in the correct test file for the affected layer (see dev-testing skill)

Do not proceed to the fix until the regression test fails for the right reason.

### 5. Implement the Fix

Make the minimal change that fixes the bug. Guidance:

- Fix the fault location identified in the plan — do not widen scope
- Preserve existing behavior for all unaffected paths
- If the fix requires a migration, follow the migration conventions in
  `glaze-backend/SKILL.md`; announce it to the user before writing it
- No refactoring, no cleanup beyond the immediate fix

### 6. Verify

Run the regression test and the full test suite for affected layers:

```bash
# Regression test must now pass
rtk bazel test //<target>:<test> --test_output=all 2>&1 | tail -30

# Full layer test suite — no regressions
rtk bazel test //api:api_test --test_output=short 2>&1 | tail -40
rtk bazel test //web:web_test --test_output=short 2>&1 | tail -40
```

If the regression test still fails, diagnose and fix before continuing.
If other tests break, address those regressions before opening the PR.

### 7. Open the PR

Load `github-pr/SKILL.md` for PR body conventions.

PR body must include:

```markdown
## Problem
<one sentence — link to the issue>

## Fix
<what changed and why this is the correct fix>

## Regression Test
<test file and test name added; why it catches this bug>

## Verification
<commands run and their outcome>

Closes #<N>
```

```bash
git push origin issue/<N>-<slug>
gh pr create \
  --title "fix: <description>" \
  --body-file /tmp/pr-body.md \
  --base main
```

### 8. Handoff

Report: PR URL, worktree path, branch name, regression test location, and
commands to clean up the worktree after merge (from `dev-environment/SKILL.md`).
