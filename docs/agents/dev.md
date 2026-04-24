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

| Script | Purpose |
|---|---|
| [`env.sh`](../../env.sh) | Interactive shells: sources `~/.bashrc`, delegates to `env-agent.sh`, then defines all `gz_*` helpers. Used as `bash --rcfile` by the VS Code/Cursor terminal profile. |
| [`env-agent.sh`](../../env-agent.sh) | Lightweight, silent bootstrap for non-interactive shells: activates `.venv` if present, loads `.env.local` vars, exports `BASH_ENV` so child processes inherit the same setup. |

`env.sh` sources `env-agent.sh` — the venv activation and env-var loading logic live in exactly one place.

### VS Code / Cursor integrated terminal

[`.vscode/settings.json`](../../.vscode/settings.json) configures a `glaze` terminal profile that runs `bash --rcfile env.sh`. New terminals automatically get the full interactive environment (venv active, `gz_*` functions, `.env.local` loaded) without any manual `source` step.

`python.terminal.activateEnvironment` is disabled so VS Code does not double-activate the venv on top of what `env.sh` already did.

### Claude Code

[`.claude/settings.json`](../../.claude/settings.json) sets `BASH_ENV=/path/to/env-agent.sh`. Every `bash -c "..."` command Claude Code runs sources `env-agent.sh` first, so `python`, `pytest`, `npm`, and `.env.local` vars are all available without a manual activation step.

### Codex and other agents

`env-agent.sh` exports `BASH_ENV` pointing at itself, so any agent process spawned from a shell that has already sourced `env.sh` (e.g. a VS Code terminal) automatically propagates the bootstrap to its own subshells. No per-tool config is needed for Codex or similar CLI agents launched from the integrated terminal.

---

## Environment variables

All vars are optional. The app runs without any of them; each missing group degrades gracefully.

**`.env.local`** (loaded by `source env.sh`, read by Django):

| Variable | Absent behavior |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | `/api/uploads/cloudinary/widget-config/` returns 503; UI falls back to URL-paste mode |
| `CLOUDINARY_API_KEY` | same as above |
| `CLOUDINARY_API_SECRET` | same as above |
| `CLOUDINARY_UPLOAD_FOLDER` | uploads go to the root of the Cloudinary account (optional) |
| `GOOGLE_OAUTH_CLIENT_ID` | `POST /api/auth/google/` is non-functional; email/password login still works |

**`web/.env.local`** (read by Vite, injected into the frontend bundle):

| Variable | Absent behavior |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google Sign-In button is not rendered; must match `GOOGLE_OAUTH_CLIENT_ID` |

---

## Testing

**All proposed changes must pass the full test suite before being submitted.**

### Common (workflow validation)

```bash
pip install -r requirements-dev.txt
pytest tests/                          # run from the repo root
```

Tests live in [`tests/test_workflow.py`](../../tests/test_workflow.py). This suite validates `workflow.yml` both structurally (via `jsonschema` against `workflow.schema.yml`) and semantically (referential integrity checks that JSON Schema cannot express). Run this suite whenever `workflow.yml` or `workflow.schema.yml` is modified.

### Backend

```bash
pip install -r requirements-dev.txt   # includes pytest and pytest-django
pytest api/                            # run from the repo root
```

Tests live in [`api/tests/`](../../api/tests/). `pytest.ini` points pytest at `backend.settings` automatically — no extra configuration needed.

### Web

```bash
cd web
npm install
npm test          # single run (used in CI)
npm run test:watch  # watch mode for development
npm run build       # CI build command: tsc -b && vite build
```

Tests live in two places:
- [`web/src/components/__tests__/`](../../web/src/components/__tests__/) — component tests (jsdom + Testing Library)
- [`frontend_common/src/workflow.test.ts`](../../frontend_common/src/workflow.test.ts) — unit tests for `workflow.ts` helpers (picked up by the web vitest config via an explicit `include` glob)

The test environment is jsdom; setup file is [`web/src/test-setup.ts`](../../web/src/test-setup.ts).

### Web build helper

```bash
source env.sh
gz_build
```

`gz_build` is the local helper for the same frontend build command used by the CI `web-build` job that also pre-generates types.

### Production build

```bash
./build.sh
```

`build.sh` runs the full production pipeline: installs Python deps, starts Django temporarily to generate TypeScript types from the live OpenAPI schema, builds the React frontend (`npm run build`), runs `collectstatic`, and applies migrations. It must pass before a PR is merged.

### CI

GitHub Actions runs all three test suites (`common`, `backend`, `web`) plus a `web-build` job (`npm run generate-types` followed by `npm run build`) in parallel on every push and pull request — see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). A PR should not be merged if any job is red.

### What to test

- Any change to `workflow.yml` or `workflow.schema.yml` → verify `pytest tests/` passes.
- Every new API endpoint or serializer change → add or update a test under `api/tests/`.
- Every new or modified React component → add or update a test in `web/src/components/__tests__/`.
- Every new or modified `workflow.ts` helper → add or update a test in `frontend_common/src/workflow.test.ts`, mocking `workflow.yml` with a minimal fixture.
- Every new or modified `api/workflow.py` helper → add or update a test in `api/tests/test_workflow_helpers.py`, patching `_STATE_MAP` / `_GLOBALS_MAP` via `monkeypatch`.

## Token Efficiency
In addition to the environment's RTK rules, make sure you use the `rtk` prefixed equivalents to common commands:

For example:
Instead of `pip`, run `gtk pip`. Also:
- cat -> rtk read
- ls -> rtk ls
- grep -> rtk grep
- gh -> rtk gh
- git -> rtk git
- npx tsc -> rtk tsc
