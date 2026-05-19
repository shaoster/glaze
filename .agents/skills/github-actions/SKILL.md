---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: github-actions
description: |
  GitHub Actions conventions for ci.yml, cd.yml, and static.yml: GITHUB_TOKEN vs
  PATs, workflow_run for CI→CD triggers, paths-ignore for doc-only pushes,
  concurrency groups for deploys, explicit secret/env mapping, and bot-actor
  guards on event-triggered jobs.
  Invoke when modifying any of the three workflow files.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# GitHub Actions Conventions

## Avoid PATs — Use `GITHUB_TOKEN` and `workflow_run`

PATs are long-lived, user-scoped, and hard to rotate. Prefer `GITHUB_TOKEN` scoped to
the repository and run. Declare only the minimum `permissions` each job needs.

For downstream workflows reacting to a completed upstream (e.g. cd.yml deploying after
ci.yml passes), use `workflow_run` rather than chaining inside the same file or using a PAT:

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
```

Guard with `if: github.event.workflow_run.conclusion == 'success'`.

## Skip CI on Documentation-Only Changes

Use `paths-ignore` on push triggers to skip expensive CI runs:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - '**/*.md'
      - '.gitignore'
      - '.vscode/**'
```

Pull requests do not need `paths-ignore` — run CI on every PR regardless.

## Prevent Concurrent Deploys

Use a `concurrency` group with `cancel-in-progress: false` so a second deploy waits
for the first rather than racing it:

```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

## Map Secrets and Variables Explicitly

Do not rely on implicit environment inheritance for deploy-time values. When a job
renders a remote `.env` or otherwise ships runtime config, map each required value
explicitly from `secrets.*` or `vars.*` in the step `env` block, then fail early if a
required deploy input is missing.

Validate the deploy surface in one step:

- required secrets and variables that the deploy cannot work without
- paired feature flags that must be complete when enabled
- optional values that may remain blank only when the feature is disabled

Example pattern:

```yaml
- name: Verify email secret
  env:
    EMAIL_HOST_PASSWORD: ${{ secrets.EMAIL_HOST_PASSWORD }}
  run: |
    if [ -z "${EMAIL_HOST_PASSWORD:-}" ]; then
      echo "EMAIL_HOST_PASSWORD is required." >&2
      exit 1
    fi
```

Use repository or environment secrets for sensitive values and GitHub Actions
variables for non-sensitive defaults. Prefer environment-scoped secrets for
deployment targets like `glaze-droplet` when the value only applies there.

## Prevent Feedback Loops on Event-Triggered Jobs

Jobs triggered by issue or PR events (e.g. the ci→cd `workflow_run` boundary) must
guard against bot-actor re-triggers. Filter at the top of every event-triggered job:

```yaml
if: |
  !endsWith(github.actor, '[bot]') &&
  ...
```

## Environment Setup in CI

```bash
source env-agent.sh
```

To run all tests: `rtk bazel test //...`
To run all linters: `rtk bazel build --config=lint //...`
To verify build: `gz_build`
