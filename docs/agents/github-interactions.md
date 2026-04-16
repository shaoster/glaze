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
- Add the appropriate `Co-authored-by:` tag to commits (e.g. `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`). Include the model version when possible.
- Every commit should have a short descriptive title with detailed bullets in the body explaining what was done and why.
- If a PR includes refactoring alongside functional changes, describe both clearly in the commit and PR body.
- All test suites pass.
- The production build succeeds.
- PR body contains "Closes #<N>" linking to the originating issue.
- PR title is concise (under 70 characters).
- No debug code, temporary workarounds, or stray `print`/`console.log` statements.
- If agent documentation (`AGENTS.md` or equivalent) was modified, check whether the project `README.md` needs a corresponding update.
- If conventions or constraints implied by the work should be respected going forward, append them to the relevant agent documentation file in a follow-up commit.

Project-specific definition-of-done checks (e.g. serializer/type alignment, workflow derivation rules) are documented in the project's domain guide.
