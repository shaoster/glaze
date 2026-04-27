# Glaze — Development Setup & Testing

## Development Setup

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8080

# Web (separate terminal)
cd web
npm install
npm run dev
```

See [`env.sh`](../../env.sh) for shell helpers (`gz_setup`, `gz_start`, etc.) that wrap these commands.
In a new environment, always run `source env.sh` and `gz_setup` before trying to do anything else.

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

### Adding a new skill

1. Create `.agents/skills/<skill-name>/SKILL.md` with the skill content.
2. Add a Claude symlink: `ln -s ../.agents/skills/<skill-name>/SKILL.md .claude/<skill-name>.md`
3. Commit both the folder and the symlink.

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
rtk bazel build --config=lint //web/...
```

Tests live in:

- [`tests/test_workflow.py`](../../tests/test_workflow.py) — workflow schema/integrity validation
- [`api/tests/`](../../api/tests/) — Django API tests (6 granular Bazel targets per concern)
- [`web/src/components/__tests__/`](../../web/src/components/__tests__/) — React component tests (12 granular Bazel targets per component)
- [`frontend_common/src/workflow.test.ts`](../../frontend_common/src/workflow.test.ts) — `workflow.ts` helper unit tests

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

Run `rtk bazel test //...` — it discovers and runs all affected tests automatically.

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
