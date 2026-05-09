---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: github-pr
description: |
  GitHub PR and issue conventions: --body-file pattern, branch naming, DoD checklist,
  sandboxed session gotchas, and scope limits requiring confirmation. Invoke when
  opening or updating a PR, writing issue comments, or checking off DoD criteria.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# GitHub PR and Issue Conventions

## Writing Issue and PR Bodies

Always write bodies to a temporary file and pass via `--body-file` — inline `--body`
causes backticks to be escaped as `\``, breaking fenced code blocks in the GitHub UI:

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

Always refer to PRs and issues as Markdown links using the full URL.
Never use bold text as a substitute for a link.

## PR Synchronization

When asked to "Update the PR," "Wrap up the PR," or similar, always perform these mechanical steps:

- **New commits**: `git push origin <branch-name>`
- **Amended history**: `git push origin <branch-name> --force-with-lease` (always prefer force-with-lease over force).
- **Body updates**: If functional changes were added, update the PR description using `gh pr edit --body-file` to keep the context accurate for reviewers.

## Branch Naming

- Issue work: `issue/<N>-short-slug` (e.g. `issue/42-fix-auth-flow`)
- Other work: `<type>/short-slug` (`fix/`, `feat/`, `docs/`, etc.)

## GitHub CLI in Sandboxed Sessions

In Codex or other sandboxed environments, `gh` commands contacting `api.github.com`
may fail because of network restrictions and can misleadingly report an invalid token.

Do not treat a sandboxed `gh` auth failure as proof that credentials are broken.
Retry with escalated permissions before concluding the token is invalid.

## Definition of Done

Before opening or pushing to a PR, verify every item:

- [ ] No redundant or copy-pasted code — confirm whether information passed at a call site is already known by the callee
- [ ] `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` tag added to commits
- [ ] Every commit has a short descriptive title with detailed bullets in the body explaining what and why
- [ ] Refactoring alongside functional changes described separately in commit and PR body
- [ ] All tests pass: `rtk bazel test //...`
- [ ] All linters pass: `rtk bazel build --config=lint //...`
- [ ] Build succeeds: `gz_build`
- [ ] PR body contains `Closes #<N>` linking to the originating issue
- [ ] PR title under 70 characters
- [ ] No debug code, temporary workarounds, or stray `print`/`console.log` statements
- [ ] Serializer output matches TypeScript types in `web/src/util/types.ts`
- [ ] State names and transitions derived from `workflow.yml`, not hardcoded
- [ ] If `AGENTS.md` was modified, check whether `README.md` needs a corresponding update
- [ ] PR description updated to reflect all functional changes (use `gh pr edit`)
- [ ] All local commits pushed to the remote branch
- [ ] Remote PR state verified (e.g., via `gh pr view` or by checking the URL)
- [ ] If conventions or constraints changed during PR work, append them to the relevant file under `docs/agents/`

## Scope Limits — Ask Before Acting

Confirm with the user before touching any of these:

- `workflow.yml` (state definitions, transitions, successors)
- `.github/workflows/` (CI/CD configuration)
- `requirements*.txt` (adding or removing Python dependencies)
- `package.json` (adding or removing npm dependencies)
- Database migrations
- `backend/settings.py`, `build.sh`, or other deployment configuration
- Destructive git operations (force pushing to `main`, branch deletion). *Note: Force-pushing to your own feature/issue branch after an amend is encouraged to keep history clean, but always use `--force-with-lease`.*
