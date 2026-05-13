# GitHub Interactions Guide

## Writing Issue and PR Bodies

Always write issue and PR bodies to a temporary file and pass them via `--body-file` rather than inline with `--body`. Passing Markdown body text inline through the shell causes backticks to be escaped as `\``, which breaks fenced code blocks and inline code in the rendered GitHub UI.

```bash
cat > /tmp/body.md << 'EOF'
Body with `inline code` and

```python
fenced code blocks
```

that render correctly.
EOF
gh issue create --title "..." --body-file /tmp/body.md
```

Always refer to PRs and issues as Markdown links using the full URL, e.g. `[owner/repo#55](https://github.com/owner/repo/pull/55)`. Never use bold text (e.g. **owner/repo#55**) as a substitute for a link.

## Branch Naming

Name branches `issue/<N>-short-slug` when opening a branch in response to a GitHub issue (e.g. `issue/42-fix-auth-flow`). For other work use `<type>/short-slug` (`fix/`, `feat/`, `docs/`, etc.).

## GitHub CLI In Sandboxed Sessions

In Codex or other sandboxed environments, `gh` commands that contact `api.github.com` may fail because of network restrictions and can misleadingly report an invalid token or auth failure.

Do not treat a sandboxed `gh` auth or repo check failure as proof that GitHub credentials are broken. If a `gh` command such as `gh auth status`, `gh repo view`, or `gh pr create` fails in a sandboxed session, retry the same command with escalated permissions before concluding that the token is invalid or the user is unauthenticated.

## Scope Limits — Ask Before Acting

Certain categories of change warrant explicit confirmation before proceeding autonomously. The project's domain guide defines the specific protected files, but the general categories are:

- Core configuration files (workflow/state-machine definitions, CI/CD pipelines)
- Dependency changes (adding or removing packages)
- Database migrations
- Deployment or build configuration
- Destructive git operations (force push, branch deletion)

If an issue seems to require one of these, post a comment asking for confirmation before proceeding.

## PR Ownership Label

When opening a pull request, apply the agent's label immediately after creation:

```bash
gh pr create --title "..." --body-file /tmp/body.md
gh pr edit <number> --add-label <agent-name>
```

The label tells the corresponding agent workflow that this PR is under its stewardship, enabling:
- Responding to `@<agent>` mentions with code changes (not just comments)
- Automatically addressing reviewer change requests

Create the label if it doesn't exist: `gh label create <agent-name> --color 5319e7`.

## Definition of Done

Before opening or pushing to a PR, verify every item:

- Check for redundant or copy-pasted code at every new or modified call site — confirm whether information passed at the call site is already known by the callee and can be removed.
- During every commit, explicitly append the `Co-authored-by: <model-name> <noreply@google.com>` tag to the commit message. The agent is responsible for identifying its current model (e.g., `gemini-3.1-flash-lite-preview`) and ensuring this tag is present before finalizing the commit.
- Every commit should have a short descriptive title with detailed bullets in the body explaining what was done and why.
- If a PR includes refactoring alongside functional changes, describe both clearly in the commit and PR body.
- All test suites pass: `rtk bazel test //...`
- All linters pass: `bazel build --config=lint //...`
- The build succeeds (gz_build).
- PR body contains "Closes #<N>" linking to the originating issue.
- PR title is concise (under 70 characters).
- No debug code, temporary workarounds, or stray `print`/`console.log` statements.
- If agent documentation (`AGENTS.md` or equivalent) was modified, check whether the project `README.md` needs a corresponding update.
- If conventions or constraints implied by the work should be respected going forward, append them to the relevant agent documentation file in a follow-up commit.

Project-specific definition-of-done checks (e.g. serializer/type alignment, workflow derivation rules) are documented in the project's domain guide.

---

## GitHub Actions: design principles

### Environment Setup

When running in a github action, or in any remote sandboxed environment, first `source env-agent.sh && gz_setup` to set up the test environment.

To run all tests, use `rtk bazel test //...` (or `gz_bazel_test`).
To run all linters, use `bazel build --config=lint //...` (or `gz_bazel_lint`).
To ensure build correctness, use `gz_build`.

### Avoid PATs — use `GITHUB_TOKEN` and `workflow_run`

Personal Access Tokens (PATs) are long-lived, user-scoped, and hard to rotate. Prefer `GITHUB_TOKEN` (scoped to the repository and the run) wherever possible. Declare only the minimum `permissions` each job actually needs.

When a downstream workflow needs to react to a completed upstream workflow (e.g. deploy after CI passes), trigger it with `workflow_run` rather than chaining it inside the same file or using a PAT to re-trigger. `workflow_run` carries its own `GITHUB_TOKEN` and does not require elevated access:

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
```

Guard the job with `if: github.event.workflow_run.conclusion == 'success'` so it only runs when the upstream actually passed.

### Skip CI on documentation-only changes

Use `paths-ignore` on push triggers to skip expensive CI runs when only docs or config files changed:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - '**/*.md'
      - '.gitignore'
      - '.vscode/**'
```

Pull requests do not need `paths-ignore` — it is acceptable to run CI on every PR regardless of what changed.

### Prevent concurrent deploys

Use a `concurrency` group on deploy jobs and set `cancel-in-progress: false` so a second deploy waits for the first to finish rather than racing it:

```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

### Prevent agent feedback loops

Agent workflows triggered by issue or PR events must guard against infinite loops where the agent's own comments re-trigger itself. Filter out bot actors at the top of every job:

```yaml
if: |
  !endsWith(github.actor, '[bot]') &&
  ...
```

---

## Multi-agent setup

When multiple autonomous agents (e.g. Claude, Codex) are active on the same repository, use labels to assign ownership and route events to the right workflow.

### Label ownership

Each agent owns the issues and PRs it created or was assigned, identified by a matching label:

- Claude applies the `claude` label to issues it acts on and PRs it opens.
- Codex applies the `codex` label to issues it acts on and PRs it opens.
- Other agents follow the same pattern with their own label.

The issue/PR workflow uses `contains(github.event.issue.labels.*.name, 'claude')` (or the equivalent for other agents) so each agent only fires on its own work and agents never interfere with each other.

Create the label if it does not exist before first use:
```bash
gh label create claude --color 5319e7 --force
```

### Restricting edit access on unlabelled PRs

When an agent is mentioned on a PR it does not own (no matching label), it should respond to the comment but must not modify any files. This prevents an agent from silently taking over another agent's PR. The workflow can enforce this with a separate job that fires on the mention but runs with `contents: read` only and instructs the agent via its prompt not to make changes.

### Issue agent → PR handoff

When an issue agent opens a PR, it should immediately apply its own label to the PR so the PR agent can take over:

```bash
rtk gh pr edit <number> --add-label claude
```

This ensures review requests and `@agent` mentions on the PR are handled by the same agent that wrote the code, without any manual label management.
