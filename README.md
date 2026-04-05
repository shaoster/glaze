# Glaze

A pottery workflow tracking application. Log pieces and record state transitions as work moves through throwing, bisque firing, glazing, and finishing.

While the UI is similar at a surface level to other craft journaling applications, the main differences are under the hood:
   - Customizable, potentially non-linear workflows. For some pieces you'll carve first, for others you'll slip first. For others, there might be multiple rounds of each.
   - Opinionated data model with immutable stage data for your piece's unique journey and your growth-minded journey as a potter. You can't change the past, so keep moving forward. (Administrative bulk data cleaning is still allowed!)
   - Data normalization around every piece's history for richer and more reliable single piece and multi-piece analysis.
   - Systematically answer questions like "How many pieces do I lose in the firing stage by glaze type?" or "How often do I ruin a piece during trimming?"

## Quick start

```bash
source env.sh
gz_setup    # first-time only: creates venv, installs deps, runs migrations, installs Node
gz_start    # starts backend (port 8080) and frontend (Vite port), press Ctrl+C to stop
```

## Development helpers (`env.sh`)

Source the file to load all shortcuts into your shell:

```bash
source env.sh
```

### Setup

| Command | Description |
|---|---|
| `gz_setup` | First-time setup: creates `.venv`, installs Python + Node deps, runs DB migrations. Installs Node via nvm if not found. |

### Servers

| Command | Description |
|---|---|
| `gz_start` | Start backend and frontend, join in the foreground. Ctrl+C stops both. Rotates old logs before starting. |
| `gz_stop` | Stop both servers. |
| `gz_status` | Show whether backend and frontend are running. |
| `gz_backend` | Start the Django backend on port 8080 (backgrounded). |
| `gz_frontend` | Start the Vite dev server (backgrounded). Prints the local URL once ready. |
| `gz_logs [backend\|frontend]` | Tail logs. Omit argument to tail both. |

Logs are written to `.dev-logs/` and rotated with a timestamp on each `gz_start`.

### Django management

| Command | Description |
|---|---|
| `gz_manage <cmd> [args…]` | Run any `manage.py` subcommand. |
| `gz_migrate` | `manage.py migrate` |
| `gz_makemigrations` | `manage.py makemigrations` |
| `gz_shell` | Django interactive shell |
| `gz_dbshell` | Raw database shell (SQLite) |
| `gz_showmigrations` | `manage.py showmigrations` |

### Testing

| Command | Description |
|---|---|
| `gz_test` | Run backend and frontend test suites in parallel. Exits non-zero if either fails. |
| `gz_test_backend` | Run `pytest` only. |
| `gz_test_frontend` | Run `vitest run` only. |

### Type generation

| Command | Description |
|---|---|
| `gz_gentypes` | Regenerate `frontend/src/generated-types.ts` from the live OpenAPI schema. Starts the backend temporarily if it is not already running. |

## Manual setup (without `env.sh`)

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver 8080

# Frontend (separate terminal)
cd frontend
npm install
npm run dev

# Type generation (backend must be running on port 8080)
cd frontend
npm run generate-types
```

## Testing

```bash
# Backend
pytest

# Frontend
cd frontend
npm test          # single run (CI)
npm run test:watch  # watch mode
```

## Vibe coding / Contributing

Glaze uses Claude agents to handle issues and PR feedback autonomously. You don't need to clone the repo or write code to contribute.

### Open an issue → get a PR

1. **Open a GitHub issue** describing the feature or bug.
   - Be specific: what should happen, what currently happens, any relevant state names from `workflow.yml`.
   - Claude will read the issue automatically and either ask clarifying questions (as a comment) or implement the change on a new branch and open a pull request.
2. **Answer any follow-up questions** Claude posts as issue comments.
   - Claude re-reads the full thread each time, so just reply naturally — no special trigger phrase needed.
3. **Review the pull request** Claude opens.
   - Claude links the PR to the issue and includes "Closes #N" in the body so the issue closes automatically on merge.

### Request changes on a PR → get a new commit

When you submit a **pull request review** with **"Request changes"**:
- Claude reads your review summary and all inline comments.
- It implements the requested changes, runs the full test suite, and pushes a new commit to the PR branch.
- It then posts a comment summarising what was changed and how each piece of feedback was addressed.

### Mention `@claude` in a PR comment

You can also invoke Claude directly in any PR comment:

```
@claude Can you refactor this to use a DRF serializer instead of a raw dict?
```

Claude will read the comment, make the change, and push it to the branch.

### Tips

- Claude always runs `pytest` (backend) and `npm test` (frontend) before opening or updating a PR. If tests fail, it will not push.
- Claude derives all state names and transitions from `workflow.yml` — you can reference state names freely in issues and it will use the correct values.
- For large or ambiguous requests, start with an issue rather than a direct PR comment so Claude can ask questions before writing code.

## Project structure

```
backend/          Django project settings, root URL config
api/              Models, serializers, views, tests
frontend/
  src/
    components/   React components
    types.ts      Shared TypeScript types (derived from generated-types.ts)
    api.ts        All HTTP calls; wire-type → domain-type mapping
    App.tsx       Root component with MUI dark theme
workflow.yml     Source of truth for piece states and valid transitions
env.sh            Development shell helpers
```

The workflow state machine and all valid transitions are defined in [`workflow.yml`](workflow.yml). Both the backend and frontend derive state names and transition rules from this file — nothing is hardcoded elsewhere.


# Using the App

TBD