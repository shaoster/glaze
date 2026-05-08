# Glaze — Development Setup & Testing

## Development Setup

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
uvicorn backend.asgi:application --port 8080 --reload  # or any free port; gz_start picks one automatically

# Web (separate terminal)
cd web
npm install
npm run dev
```

See [`env.sh`](../../env.sh) for shell helpers (`gz_setup`, `gz_start`, etc.) that wrap these commands.
In a new environment, always run `source env.sh` and `gz_setup` before trying to do anything else.
`gz_setup` reuses the main checkout's `.venv` and `web/node_modules` by default when invoked from a repo-local worktree. Use `gz_setup --isolated` (or `GLAZE_SETUP_ISOLATED=1 gz_setup`) when a branch needs its own dependency environment, such as when changing Python requirements or Node packages.

---

## Shell environment for interactive and agent use

Two scripts handle environment bootstrap:

| Script                               | Purpose                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`env.sh`](../../env.sh)             | Interactive shells: sources `~/.bashrc`, delegates to `env-agent.sh`, then defines all `gz_*` helpers. Used as `bash --rcfile` by the VS Code/Cursor terminal profile.         |
| [`env-agent.sh`](../../env-agent.sh) | Lightweight, silent bootstrap for non-interactive shells: activates `.venv` if present, loads `.env.local` vars, exports `BASH_ENV` so child processes inherit the same setup. |

`env.sh` sources `env-agent.sh` — the venv activation and env-var loading logic live in exactly one place.

### VS Code / Cursor integrated terminal

[`.vscode/settings.json`](../../.vscode/settings.json) configures a `glaze` terminal profile that runs `bash --rcfile env.sh`. New terminals automatically get the full interactive environment (venv active, `gz_*` functions, `.env.local` loaded) without any manual `source` step.

`python.terminal.activateEnvironment` is disabled so VS Code does not double-activate the venv on top of what `env.sh` already did.

### Claude Code

[`.claude/settings.json`](../../.claude/settings.json) sets `BASH_ENV=/path/to/env-agent.sh`. Every `bash -c "..."` command Claude Code runs sources `env-agent.sh` first, so `python`, `pytest`, `npm`, and `.env.local` vars are all available without a manual activation step.

### Codex and other agents

`env-agent.sh` exports `BASH_ENV` pointing at itself, so any agent process spawned from a shell that has already sourced `env.sh` (e.g. a VS Code terminal) automatically propagates the bootstrap to its own subshells. No per-tool config is needed for Codex or similar CLI agents launched from the integrated terminal.

### Agent worktree location

Keep agent-created worktrees inside the repository instead of under `/tmp` or another system temp directory:

- Shared worktree root: `.agent-worktrees/<agent>/<branch-or-task>`
- Claude example: `.agent-worktrees/claude/<branch-or-task>`
- Codex example: `.agent-worktrees/codex/<branch-or-task>`

Keep repo-local agent configuration out of `.codex`, which may be reserved by the local Codex installation. Prefer:

- Codex-specific local config: `.agent-config/codex/`
- Shared agent assets and instructions: `.agents/`

This keeps worktrees close to the repo-local bootstrap, makes cleanup easier, and avoids temp-directory permission/path surprises. `env-agent.sh` resolves the active git worktree root from the current working directory, then falls back to the main checkout's `.env.local` files and `.venv` when the worktree does not have its own copies yet. Since `gz_start` selects an environment based on the resolved `.env` location, agents should symlink the untracked `$GLAZE_ROOT/.env.local` into the newly created worktree to ensure the worktree's code is being validate instead of the root repo's.

When you do want a truly separate dependency environment inside the worktree, run `gz_setup --isolated` to replace any shared `.venv` or `web/node_modules` symlinks with local worktree-specific installs.

### One terminal per worktree

**The mental model is: one terminal = one worktree.** Do not re-source `env.sh` from a different worktree in the same terminal session.

When you `source env.sh`, `GLAZE_ROOT` is set to that file's directory and all server state — PID files, port assignments, logs — is scoped under `$GLAZE_ROOT/.dev-pids/` and `.dev-logs/`. If you later `source env.sh` from a different worktree in the same terminal, `GLAZE_ROOT` changes but any servers started from the old root become invisible: `gz_stop` will look in the new root's `.dev-pids/` and find nothing. You now have orphaned processes with no clean kill path.

The consequence is simple: **open a new terminal tab for each worktree.** VS Code's `glaze` terminal profile does this automatically — each new tab sources `env.sh` from wherever the tab was opened.

Server ports are assigned dynamically at `gz_start` time. Django picks the first free port at or above 8080; Vite picks the first free port at or above 5173. The assigned ports are written to `.dev-pids/backend.port` and `.dev-pids/web.port` in that worktree's directory, and Vite's proxy target is set from `$BACKEND_PORT` at startup. Two worktrees can therefore run their full dev stacks simultaneously without port conflicts.

Use `gz_status` to see what is running and on which ports in the current worktree context. To see all Glaze server processes across every worktree at once:

```bash
gz_worktrees               # all worktrees; ● marks those with running servers
pgrep -a -f "uvicorn"                # all uvicorn instances (cross-worktree)
ss -tlnp | grep -E 'node|python'    # all bound ports with owning process
```

### Cleanup on terminal close

`gz_start` registers a shell `EXIT` trap that calls `gz_stop` automatically when the terminal tab closes. This is best-effort: it fires on normal exits (Ctrl-D, typing `exit`, clicking the X on the tab) but not on SIGKILL. In practice this covers the PR-review workflow — you open a tab, start servers, test, close the tab.

The trap is intentionally registered only inside `gz_start`, so terminals that never called `gz_start` are unaffected. There is no VS Code-native terminal-close hook; the shell `EXIT` trap is the right mechanism here.

### Navigating to an agent's worktree

Use `gz_worktrees` to list all worktrees with their branch names, paths, and a `●` indicator for any that have servers running:

```
gz_worktrees
  main                                                /home/phil/code/glaze
  issue/123-fix-foo                                   /home/phil/code/glaze/.agent-worktrees/claude/issue-123-fix-foo  ●
  issue/456-add-bar                                   /home/phil/code/glaze/.agent-worktrees/codex/issue-456-add-bar
```

To jump to a worktree in the current terminal, use `gz_cd <pattern>`. It matches against the path, so the issue number or branch slug are both valid:

```bash
gz_cd 123           # cd to the issue-123 worktree and re-source env.sh
gz_cd issue-456     # same for a different branch
```

`gz_cd` blocks the switch if servers are currently running in the terminal — you must `gz_stop` first or open a new tab. For PR review, the recommended flow is:

1. `gz_worktrees` — identify the target path (run from any terminal)
2. Open a new terminal tab (Ctrl+Shift+\` in VS Code)
3. `gz_cd <pattern>` in the new tab — takes you to the right worktree and sets up the environment
4. `gz_start` — starts servers, opens browser, registers the EXIT cleanup

### Multi-agent workflow

When multiple agents (Claude, Codex, etc.) are working on separate PRs in parallel:

1. **Each agent owns one worktree.** The standard path is `.agent-worktrees/<agent>/<branch>`. The agent sources `env.sh` from there, and all its server state stays isolated in that directory.

2. **Agents must announce their worktree path** at the start of every session, clearly and as a copy-friendly absolute path. This is the contract that makes `gz_worktrees` and `gz_cd` useful — a path buried in scrollback is not sufficient. The announcement should appear before any code changes so it is visible when you open the conversation.

3. **Open a dedicated terminal tab per active worktree** before running `gz_start`. This matches the one-terminal-per-worktree rule and makes `gz_stop` and the EXIT trap reliable.

4. **Ports auto-select.** No manual port coordination is needed. `gz_start` in worktree A and `gz_start` in worktree B will land on different ports automatically.

5. **`gz_open` opens the browser to the right URL** for whichever worktree's terminal you run it from. After `gz_start` in a new worktree, the browser tab goes to that worktree's Vite port, proxying to that worktree's Django instance.

6. **Cleanup is per-worktree.** `gz_stop` in worktree A does not affect worktree B's servers. Closing the terminal tab triggers best-effort cleanup via the EXIT trap. When you are done reviewing a PR, either `gz_stop` explicitly or just close the tab.

7. **Agent-initiated `gz_start` is unnecessary.** `gz_start` is a single shell command; the lifecycle problem (who stops the servers?) is already solved by the EXIT trap on terminal close. Just run `gz_start` manually in the worktree's tab.

### Explicit `/do #<issue>` agent flow

For new issue work, use the `do-issue-worktree` skill. A prompt such as
`/do #292` means the agent must create and announce a repo-local worktree before
issue analysis or code changes:

```text
Worktree: /home/phil/code/glaze/.agent-worktrees/codex/issue-292-vibe-coding-flow
```

Use `.agent-worktrees/<agent>/issue-<N>-<slug>` for the worktree and
`issue/<N>-<slug>` for the branch. The developer can then open a new terminal
tab, run `gz_cd <N>`, and use `gz_start` there if they want to review the app.

After the PR is merged or the branch is abandoned, stop servers in that
worktree's terminal and remove the local worktree:

```bash
gz_stop
git worktree remove .agent-worktrees/<agent>/issue-<N>-<slug>
git worktree prune
git branch -d issue/<N>-<slug>
```

Use `git branch -D` only for abandoned unmerged work after confirming the branch
is no longer needed.

### Adding a new Python package

Bazel resolves Python packages from `requirements.lock` (pin-compiled from `requirements-dev.txt`). Three steps are required when adding a new package:

**1. Add to `requirements.txt`** (runtime dep) or `requirements-dev.txt` (dev/lint/test only):

```bash
# Edit requirements.txt or requirements-dev.txt, then regenerate the lock.
# Always run pip-compile from the repo root using requirements-dev.txt so that
# dev deps (pytest-django, mypy stubs, etc.) are preserved in the lock file.
pip-compile --generate-hashes --output-file=requirements.lock requirements-dev.txt
```

If working in a worktree, run from the worktree root after copying or symlinking `requirements-dev.txt` there — the `-r requirements.txt` inside it is a relative path that must resolve to the worktree's own `requirements.txt`.

**2. Install locally** so the running dev server and tests pick it up:

```bash
pip install -r requirements.txt
```

**3. Add `requirement("package-name")` to the right `BUILD.bazel` target.**

Bazel sandboxes don't inherit the venv — every package a target imports must be declared in its `deps`. The key target is `api_lib` in [`api/BUILD.bazel`](../../api/BUILD.bazel):

```python
deps = [
    "//backend:backend_lib",
    requirement("httpx"),   # ← add runtime packages here
],
```

Test-only packages (e.g. `pytest-django`) are already declared in `_TEST_DEPS` and don't need to be added again. Verify the target builds in the sandbox before committing:

```bash
rtk bazel build //api:api_lib
rtk bazel test //api:api_test //api:api_mypy
```

Commit `requirements.txt`, `requirements.lock`, `MODULE.bazel.lock` (updated automatically by Bazel), and the `BUILD.bazel` change together.

---

### Updating pnpm-lock.yaml after npm installs

Bazel resolves npm packages from `web/pnpm-lock.yaml`. After any `npm install` that adds or removes packages, regenerate the lockfile with `pnpm import` so Bazel picks up the change:

```bash
# Install the package normally (from the repo root or web/ — npm resolves via web/package.json)
(cd web && npm install react-swipeable)

# Regenerate the pnpm lockfile from the updated package-lock.json
# pnpm must be run from web/ where package.json and pnpm-lock.yaml live
(cd web && pnpm import)

# Commit both the updated package files
git add web/package.json web/package-lock.json web/pnpm-lock.yaml
```

`pnpm` is available at `~/.nvm/versions/node/*/bin/pnpm` when nvm is active. If `env-agent.sh` has sourced `.nvm/nvm.sh`, the `pnpm` binary is on `$PATH` and the `(cd web && pnpm import)` subshell inherits it.

After updating the lockfile, check whether the new package needs to be added to a `js_library` `srcs` or `deps` in the relevant `BUILD.bazel`. Use `rtk bazel query 'labels(srcs, <library-target>)'` to inspect what a target currently includes, and add the package to the appropriate `BUILD.bazel` entry if Bazel tests fail with a missing module error.

---

### Orientation inside a worktree

In a git worktree `.git` is a **file**, not a directory — `cat .git/HEAD` will fail. To confirm which branch a worktree is on:

```bash
cat .git                    # shows: gitdir: /path/to/.git/worktrees/<name>
git branch --show-current   # shows the checked-out branch
```

`git checkout <branch>` fails inside a worktree with "already used by worktree" if that branch is already checked out there — this is the normal signal that you are already on the right branch. Do not attempt to switch away and back; just confirm with `git branch --show-current` and proceed.

### Working directory discipline

Always run `git` commands from the repo root. When a command must run from a subdirectory, wrap it in a subshell so the caller's working directory is unchanged:

```bash
# ✅ correct — shell stays at repo root after this line
(cd web && npx pnpm install)
git add web/pnpm-lock.yaml

# ❌ incorrect — shell is now inside web/, breaking the git add
cd web && npx pnpm install
git add web/pnpm-lock.yaml   # fails: no web/web/pnpm-lock.yaml
```

`git add` paths are relative to the current working directory, not the repo root, so keeping all `git` invocations at the root avoids silent path mistakes.

---

## Skills

Reusable agent skills live in [`.agents/skills/`](../../.agents/skills/). Each skill is a folder containing a `SKILL.md` file.

| Agent       | How skills are loaded                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Codex       | Reads `.agents/skills/` natively — no setup needed                                                                   |
| Claude Code | Reads `.claude/<name>.md`; each skill has a git-tracked symlink there pointing into `.agents/skills/<name>/SKILL.md` |

Key local skills:

| Skill                         | Use                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `do-issue-worktree`           | Start a single issue or PR-sized change with `/do #<issue>` and an immediate worktree setup. |
| `git-worktree-agent-workflow` | Coordinate parallel worktrees or recover mixed work that needs to be split into focused PRs. |

### Adding a new skill

1. Create `.agents/skills/<skill-name>/SKILL.md` with the skill content.
2. Add a Claude symlink: `ln -s ../.agents/skills/<skill-name>/SKILL.md .claude/<skill-name>.md`
3. Commit both the folder and the symlink.

---

## Streaming download smoke tests

Use this check when changing large download endpoints, especially
`StreamingHttpResponse` paths that run in production under ASGI. The local
`gz_start` backend uses Django's development server rather than Gunicorn/Uvicorn,
so this does not prove production worker memory behavior by itself. It does
confirm the endpoint streams lazily in local development and gives reviewers a
repeatable way to catch obvious buffering regressions before deploy.

Start the app from a dedicated terminal:

```bash
source env.sh
gz_setup
gz_start
```

In another terminal, find the active backend port and Django process:

```bash
BACKEND_PORT=$(cat .dev-pids/backend.port)
pgrep -a -f "uvicorn.*${BACKEND_PORT}"
```

Watch the backend RSS while exercising the download:

```bash
BACKEND_PID=$(pgrep -f "uvicorn.*$(cat .dev-pids/backend.port)")
watch -n 1 "ps -o pid,rss,vsz,cmd -p ${BACKEND_PID}"
```

Then use the browser opened by `gz_start` to log in as an admin and trigger the
same large download three times. For the Cloudinary cleanup archive, scan assets
from the admin cleanup page and use the archive download action.

Expected result:

- RSS may rise and remain at a high-water mark after the first download.
- Repeated same-size downloads should plateau instead of ratcheting upward by
  roughly the archive size.
- The ASGI production logs should not contain Django's warning:
  `StreamingHttpResponse must consume synchronous iterators in order to serve them asynchronously.`

For production parity, repeat the same browser flow against a Docker/staging
deployment and watch the Gunicorn/Uvicorn worker RSS:

```bash
docker compose exec web ps -o pid,rss,vsz,cmd
docker compose logs web | grep -i 'StreamingHttpResponse\|synchronous iterators'
```

For large downloads served by ASGI, use async generators and async clients such
as `httpx.AsyncClient`. Stable RSS after repeated downloads is part of the
definition of done; RSS that keeps climbing across identical downloads means the
response is probably being buffered or retained.

---

## Environment variables

All vars are optional. The app runs without any of them; each missing group degrades gracefully.

**`.env.local`** (loaded by `source env.sh`, read by Django):

| Variable                   | Absent behavior                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `CLOUDINARY_CLOUD_NAME`    | `/api/uploads/cloudinary/widget-config/` returns 503; UI falls back to URL-paste mode |
| `CLOUDINARY_API_KEY`       | same as above                                                                         |
| `CLOUDINARY_API_SECRET`    | same as above                                                                         |
| `CLOUDINARY_UPLOAD_FOLDER` | uploads go to the root of the Cloudinary account (optional)                           |
| `GOOGLE_OAUTH_CLIENT_ID`   | `POST /api/auth/google/` is non-functional; email/password login still works          |

**`web/.env.local`** (read by Vite, injected into the frontend bundle):

| Variable                | Absent behavior                                                            |
| ----------------------- | -------------------------------------------------------------------------- |
| `VITE_GOOGLE_CLIENT_ID` | Google Sign-In button is not rendered; must match `GOOGLE_OAUTH_CLIENT_ID` |

---

## Testing and validation

**All proposed changes must pass the full test suite and all linters before being submitted.**

### CI-aligned validation (Bazel — matches what CI runs)

Run these before opening or pushing to a PR:

```bash
# All tests (workflow, backend, web, mypy)
rtk bazel test //...

# All linters: ruff, eslint, tsc, mypy (tagged "lint")
rtk bazel build --config=lint //...
```

### Auto-fix before committing

```bash
# Reformat Python files and apply ruff auto-fixes
source env.sh && gz_format
# equivalent to:
ruff format .
ruff check --fix .
```

Run from the repo root with the venv active. There is no Bazel-integrated auto-fix step.

### Individual suites (fast iteration during development)

Prefer Bazel targets — they match CI exactly and benefit from incremental caching:

Before running a granular Bazel test after adding or importing new source files,
check that the target's source slice includes the new dependencies. Use
`rtk bazel query 'labels(srcs, <library-target>)'` (for example,
`rtk bazel query 'labels(srcs, //web:workflow_state_src)'`) to inspect the
files currently included, then add any missing component files or helper modules
to the appropriate `BUILD.bazel` `js_library` before rerunning the test. Use
`rtk bazel query 'deps(<test-target>)'` only when the relevant source library is
not obvious.

This matters especially when a page is refactored into a page-local subfolder
such as `web/src/pages/<PageName>/`: update the matching `js_library` `srcs`
and the focused test target inputs at the same time, or Bazel may keep running
against an incomplete source slice even though Vite-based local tests pass.

```bash
# Workflow schema validation
rtk bazel test //tests:...

# Backend API tests (many granular targets: //api:api_workflow_test, etc.)
rtk bazel test //api:api_test

# Backend mypy (with Django plugin — runs full app initialization)
rtk bazel test //api:api_mypy

# Web component tests
rtk bazel test //web:web_test
cd web && npm run test:watch           # watch mode (no Bazel equivalent)

# Web type-check + lint (both covered by the lint target)
# Do not run tsc directly — tsc may not resolve depending on environment setup.
rtk bazel build --config=lint //web/...
```

Tests live in:

- [`tests/test_workflow.py`](../../tests/test_workflow.py) — workflow schema/integrity validation
- [`api/tests/`](../../api/tests/) — Django API tests (6 granular Bazel targets per concern)
- [`web/src/components/__tests__/`](../../web/src/components/__tests__/) — React component tests (12 granular Bazel targets per component)
- [`web/src/util/workflow.test.ts`](../../web/src/util/workflow.test.ts) — `workflow.ts` helper unit tests
- [`web/src/util/__tests__/api.test.ts`](../../web/src/util/__tests__/api.test.ts) — `api.ts` unit tests (axios mocked)

**Keep tests in their domain-specific file.** Each Bazel target covers one coherent slice of the API so that only the relevant target re-runs when a file changes. When adding new tests, extend the existing file that already covers the same module or feature area (e.g. auth tests go in `test_auth.py`, glaze-import tests go in `test_manual_square_crop_import.py`). Do not create a new cross-cutting file — it ends up in a catch-all target that runs on every change and makes failures harder to locate.

### Web build helper

```bash
source env.sh
gz_build
```

`gz_build` pre-generates TypeScript types then runs `tsc -b && vite build`.

### CI

GitHub Actions runs three parallel jobs on every push and pull request — see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). A PR should not be merged if any job is red.

| Job        | What it runs                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test`     | `bazel test --config=ci //...` — all test suites                                                                                                                |
| `lint`     | `bazel build --config=ci --config=lint //...` — ruff, eslint, tsc, mypy                                                                                         |
| `coverage` | `pytest api/ tests/ --cov` + `npm test --coverage` — feeds Codecov (separate from Bazel until [#159](https://github.com/shaoster/glaze/issues/159) is resolved) |

Coverage reports are uploaded to [Codecov](https://codecov.io). Codecov posts a summary comment on each PR.

### What to test

Run `rtk bazel test //...` — it discovers and runs all affected tests automatically. Do not pick granular targets to save time during iterative debugging. Bazel caches passing targets, so re-running `//...` after a fix costs no more than running a single target when the others haven't changed.

## Token Efficiency

In addition to the environment's RTK rules, make sure you use the `rtk` prefixed equivalents to common commands:

For example:
Instead of `pip`, run `rtk pip`. Also:

- cat -> rtk read
- ls -> rtk ls
- grep -> rtk grep
- gh -> rtk gh
- git -> rtk git
- npx tsc -> rtk tsc
- bazel -> rtk bazel
