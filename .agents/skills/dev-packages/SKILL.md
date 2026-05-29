---
model: opus
created: 2026-05-08
modified: 2026-05-28
reviewed: 2026-05-28
name: dev-packages
description: |
  Adding Python or npm packages to Glaze: lock file regeneration (uv / pnpm),
  BUILD.bazel dep declarations including adding npm packages to BOTH the dev/build
  (web_lib, component *_src) and production (web_prod_lib) lib targets, and the
  commit checklist. Invoke when an issue requires adding, removing, or upgrading a
  dependency.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Adding Packages

## Adding a New Python Package

Bazel resolves Python packages from `uv.lock`. Three steps required:

**1. Add to `pyproject.toml`** (runtime or dev), then regenerate the lock:

```bash
rtk bazel run @uv//:uv -- add httpx           # runtime
rtk bazel run @uv//:uv -- add --dev pytest    # dev/lint/test only
```

Always run `uv` commands from the repo root. In a worktree, run from the worktree root.

**2. Sync local environment:**

```bash
rtk bazel run @uv//:uv -- sync
```

**3. Add `"@pypi//package_name"` to the right `BUILD.bazel` target.**

Bazel sandboxes don't inherit the venv — every package a target imports must be declared
in its `deps`. The key target is `api_lib` in `api/BUILD.bazel`:

```python
deps = [
    "//backend:backend_lib",
    "@pypi//httpx",   # ← add runtime packages here
],
```

Test-only packages (e.g. `pytest-django`) are already in `_TEST_DEPS` — no duplicate needed.

Verify in the sandbox before committing:
```bash
rtk bazel build //api:api_lib
rtk bazel test //api:api_test //api:api_mypy
```

Commit `pyproject.toml`, `uv.lock`, `MODULE.bazel.lock` (updated automatically
by Bazel), and the `BUILD.bazel` change together.

## Adding a New npm Package

Bazel resolves npm packages from `web/pnpm-lock.yaml`. After any `npm install`:

Prefer Python for standalone dev tooling when the dependency graph allows it. Use the JS tool path under `web/scripts/` when the tool belongs on the web dependency graph or when the needed package exists in npm but not pip. In those cases, wire the script through `web/BUILD.bazel` with `js_binary`, and add a `vitest_test` when you want the tool itself covered by tests.

```bash
# Install the package
(cd web && npm install react-swipeable)

# Regenerate the pnpm lockfile from the updated package-lock.json
# pnpm must run from web/ where package.json and pnpm-lock.yaml live
(cd web && pnpm import)
```

`source env.sh` prepends the repo-local `bin/` directory, so `npm` and `pnpm`
resolve to the Bazel-aware wrappers by default.

### Wire the package into the Bazel lib targets — **dev and prod, by default**

A new npm package imported by app code must be declared in **both** the production
bundle and the dev/build + test libraries. Adding it to only one is the most common
footgun here — `react-easy-crop` shipped broken twice because it was added to one lib
target and not the other, fixed in two separate commits. Add it to both in the same
change:

| Target | File | How deps are declared | Action for a new package |
|---|---|---|---|
| `web_prod_lib` | `web/BUILD.bazel` | **Enumerates each package** (`:node_modules/<pkg>`) | **Always add** `:node_modules/<pkg>` |
| `web_lib` (dev/build) | `web/BUILD.bazel` | Broad `:node_modules` + a few explicit entries | **Add** `:node_modules/<pkg>` by default — the broad dep does not reliably resolve every package (e.g. `react-easy-crop` needed an explicit entry) |
| Component `*_src` libs (tests) | `web/BUILD.bazel` | Broad `:node_modules` | Add `:node_modules/<pkg>` to any `*_src` lib whose component imports it, if its `vitest_test` fails to resolve the module |

Keep `web_prod_lib`'s list alphabetized (it currently is). Inspect a target's current
deps with:

```bash
rtk bazel query 'labels(deps, //web:web_prod_lib)'
rtk bazel query 'labels(deps, //web:web_lib)'
```

Verify both the dev/build path and the prod bundle resolve the package before committing:

```bash
rtk bazel build //web:web_lib //web:web_prod_lib
rtk bazel test //web:web_test          # exercises the component *_src libs
```

Commit `web/package.json`, `web/package-lock.json`, `web/pnpm-lock.yaml`, and the
`web/BUILD.bazel` lib-target changes together.
