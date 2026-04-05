# Glaze

A pottery workflow tracking application. Log pieces and record state transitions as work moves through throwing, bisque firing, glazing, and finishing.

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
workflow.json     Source of truth for piece states and valid transitions
env.sh            Development shell helpers
```

The workflow state machine and all valid transitions are defined in [`workflow.json`](workflow.json). Both the backend and frontend derive state names and transition rules from this file — nothing is hardcoded elsewhere.
