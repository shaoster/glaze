---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: dev-packages
description: |
  Adding Python or npm packages to Glaze: pip-compile lock file regeneration,
  BUILD.bazel requirement() declarations, pnpm import for npm, and commit checklist.
  Invoke when an issue requires adding, removing, or upgrading a dependency.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Adding Packages

## Adding a New Python Package

Bazel resolves Python packages from `requirements.lock`. Three steps required:

**1. Add to `requirements.txt`** (runtime) or `requirements-dev.txt` (dev/lint/test only),
then regenerate the lock from the repo root:

```bash
pip-compile --generate-hashes --output-file=requirements.lock requirements-dev.txt
```

Always run `pip-compile` from the repo root using `requirements-dev.txt` so that dev deps
(pytest-django, mypy stubs, etc.) are preserved in the lock file. In a worktree, run from
the worktree root after copying or symlinking `requirements-dev.txt` there.

**2. Install locally:**

```bash
pip install -r requirements.txt
```

**3. Add `requirement("package-name")` to the right `BUILD.bazel` target.**

Bazel sandboxes don't inherit the venv — every package a target imports must be declared
in its `deps`. The key target is `api_lib` in `api/BUILD.bazel`:

```python
deps = [
    "//backend:backend_lib",
    requirement("httpx"),   # ← add runtime packages here
],
```

Test-only packages (e.g. `pytest-django`) are already in `_TEST_DEPS` — no duplicate needed.

Verify in the sandbox before committing:
```bash
rtk bazel build //api:api_lib
rtk bazel test //api:api_test //api:api_mypy
```

Commit `requirements.txt`, `requirements.lock`, `MODULE.bazel.lock` (updated automatically
by Bazel), and the `BUILD.bazel` change together.

## Adding a New npm Package

Bazel resolves npm packages from `web/pnpm-lock.yaml`. After any `npm install`:

```bash
# Install the package
(cd web && npm install react-swipeable)

# Regenerate the pnpm lockfile from the updated package-lock.json
# pnpm must run from web/ where package.json and pnpm-lock.yaml live
(cd web && pnpm import)
```

`pnpm` is available at `~/.nvm/versions/node/*/bin/pnpm` when nvm is active. If
`env-agent.sh` has sourced `.nvm/nvm.sh`, the `pnpm` binary is on `$PATH` and the
subshell inherits it.

After updating the lockfile, check whether the new package needs to be added to a
`js_library` `srcs` or `deps` in the relevant `BUILD.bazel`:

```bash
rtk bazel query 'labels(srcs, <library-target>)'  # inspect what a target currently includes
```

Add the package to the appropriate `BUILD.bazel` entry if Bazel tests fail with a
missing module error.

Commit `web/package.json`, `web/package-lock.json`, and `web/pnpm-lock.yaml` together.
