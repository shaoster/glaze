---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: github-actions
description: |
  GitHub Actions conventions for ci.yml, cd.yml, and static.yml: GITHUB_TOKEN vs
  PATs, workflow_run for CI→CD triggers, paths-ignore for doc-only pushes,
  concurrency groups for deploys, and bot-actor guards on event-triggered jobs.
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
source env-agent.sh && gz_setup
```

To run all tests: `rtk bazel test //...`
To run all linters: `rtk bazel build --config=lint //...`
To verify build: `gz_build`
