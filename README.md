# Glaze

A pottery workflow tracking application. Log pieces and record state transitions as work moves through throwing, bisque firing, glazing, and finishing.

## For new developers
This guide assumes you already know the tools listed below and are familiar with [separation of concerns](https://en.wikipedia.org/wiki/Separation_of_concerns) and [abstraction](https://en.wikipedia.org/wiki/Abstraction_(computer_science)) as design principles; if any term is unfamiliar, click the linked docs to catch up quickly.

- **[Django](https://www.djangoproject.com/)** is the Python web framework that owns the backend (`backend/`, `api/`). [Separation of concerns](https://en.wikipedia.org/wiki/Separation_of_concerns) keeps unrelated responsibilities apart so each layer stays simpler to reason about—for example, [`api/models.py`](api/models.py) defines the data schema, [`api/serializers.py`](api/serializers.py) translates between ORM objects and JSON payloads, and [`api/views.py`](api/views.py) wires those serializers into `/api/...` endpoints that enforce workflow rules from [`workflow.yml`](workflow.yml). That split keeps the REST API (powered by Django REST Framework, DRF) resilient even when one layer needs to change, while returning consistent data/validation to all clients.
- **[React](https://react.dev/)** (web/src/) renders the SPA (Single Page Application) and consumes shared types/API helpers from [`frontend_common/src/types.ts`](frontend_common/src/types.ts) and [`frontend_common/src/api.ts`](frontend_common/src/api.ts). React follows a component-based paradigm where functions or classes receive props (inputs) and return HTML that the browser can render.
- **[Vite](https://vitejs.dev/)** (web tooling) bundles the React app. It provides fast dev reloads (hot module replacement) so UI changes appear immediately while you work, runs the local dev server that powers our web workbench, serves as the underlying runner for `npm test`, and produces optimized production builds (tree shaking, minification) so the deployed bundle is as small and performant as possible.
- **[Material UI](https://mui.com/)** supplies the component library used everywhere in the UI for forms, dialogs, buttons, and layout.
- **[Axios](https://axios-http.com/)** is the HTTP client library we use in the web to talk to REST APIs; it keeps things simple by handling the details of sending and receiving JSON so the UI code does not have to repeat that work. Benefits of Axios over raw `fetch` include centralized configuration of base URLs and headers, automatic JSON parsing/serialization, and built-in hooks for handling errors, cancellations, and retries. In this project that means [`WorkflowState.tsx`](web/src/components/WorkflowState.tsx) can rely on helpers like `updateCurrentState`/`updatePiece` instead of duplicating URLs or JSON logic, and we have a single place for surfaces errors before they hit the UI.
- A **[client library](https://en.wikipedia.org/wiki/Library_(computing))** is a reusable set of functions that wraps low-level protocols (like HTTP) so developers can interact with remote services using clean function calls, in their programming language of choice, instead of handling bytes, headers, or parsing manually.

## Motivation

While the UI is similar at a surface level to other craft journaling applications, the main differences are under the hood:
   - Customizable, potentially non-linear workflows. For some pieces you'll carve first, for others you'll slip first. For others, there might be multiple rounds of each.
   - Opinionated data model with immutable stage data for your piece's unique journey and your growth-minded journey as a potter. You can't change the past, so keep moving forward. (Administrative bulk data cleaning is still allowed!)
   - Data normalization around every piece's history for richer and more reliable single piece and multi-piece analysis.
   - Systematically answer questions like "How many pieces do I lose in the firing stage by glaze type?" or "How often do I ruin a piece during trimming?"

## Authentication and Data Isolation

Glaze now runs as a user-scoped application with session authentication.

- Auth is session/cookie-based (Django + DRF `SessionAuthentication`).
- The web client fetches a CSRF cookie from `GET /api/auth/csrf/` before login/logout/register writes.
- Auth endpoints:
  - `POST /api/auth/login/`
  - `POST /api/auth/logout/`
  - `GET /api/auth/me/`
  - `POST /api/auth/register/` (backend supported; see UI note below)
- Workflow/data endpoints (`/api/pieces/*`, `/api/globals/*`) require authentication.

Per-user data isolation rules:

- Every user-owned domain object (`Piece`, `PieceState`, `Location`, `ClayBody`, `GlazeType`, `GlazeMethod`) has a `user` foreign key.
- List endpoints only return objects for `request.user`.
- Detail/update endpoints fetch objects from a user-filtered queryset. If another user's ID is requested, the API returns `404` (not `403`) to avoid leaking object existence.
- Global reference entries are user-scoped; names are unique per user (for example, two users can both have a `Location` named "Kiln A" without colliding).

## Quick start
This section is for folks who just want to fire up the whole stack quickly and start poking around the app.

```bash
source env.sh
gz_setup    # first-time only: creates venv, installs deps, runs migrations, installs Node
gz_start    # starts backend (port 8080) and web (Vite port), press Ctrl+C to stop
```

## Development helpers (`env.sh`)
Use these shortcuts once you've sourced `env.sh`; they wrap common CLI sequences so you can focus on implementing features instead of hunting for the right flags. The `env.sh` script sets up Python/Node paths, loads useful aliases (`gz_setup`, `gz_start`, etc.), and keeps environment-specific tweaks (like log rotation and virtualenv activation) centralized, so every developer runs commands against the same configuration without manually sourcing multiple files.

Source the file to load all shortcuts into your shell:

```bash
source env.sh
```

### Local secrets and config (git-safe)
Keep local-only settings in `.env.local` files; they are gitignored by default:

- `.env.local` (repo-wide defaults)
- `web/.env.local` (web-only overrides)
- `mobile/.env.local` (mobile-only overrides)

`source env.sh` automatically loads all three (in that order) so you can inject Cloudinary/API config without committing secrets.
Use the checked-in templates:

```bash
cp .env.example .env.local
cp web/.env.example web/.env.local
cp mobile/.env.example mobile/.env.local
```

### Setup

| Command | Description |
|---|---|
| `gz_setup` | First-time setup: creates `.venv`, installs Python + Node deps, runs DB migrations. Installs Node via nvm if not found. |

### Servers

| Command | Description |
|---|---|
| `gz_start` | Start backend and web, join in the foreground. Ctrl+C stops both. Rotates old logs before starting. |
| `gz_stop` | Stop both servers. |
| `gz_status` | Show whether backend and web are running. |
| `gz_backend` | Start the Django backend on port 8080 (backgrounded). |
| `gz_web` | Start the Vite dev server (backgrounded). Prints the local URL once ready. |
| `gz_logs [backend\|web]` | Tail logs. Omit argument to tail both. |

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
| `gz_test` | Run all three test suites (common, backend, web) in parallel. Exits non-zero if any fails. |
| `gz_test_common` | Run workflow schema/integrity tests only (`pytest tests/`). |
| `gz_test_backend` | Run Django API tests only (`pytest api/`). |
| `gz_test_web` | Run web tests only (`npm test`). |

### Type generation

| Command | Description |
|---|---|
| `gz_gentypes` | Regenerate [`frontend_common/src/generated-types.ts`](frontend_common/src/generated-types.ts) from the live OpenAPI schema. Starts the backend temporarily if it is not already running. |

Run `gz_help` to print the full list of shortcuts at any time.

## Manual setup (without `env.sh`)
If you prefer to install dependencies and run servers yourself, follow these explicit commands instead of relying on the helper script.

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver 8080

# Web (separate terminal)
cd web
npm install
npm run dev

# Type generation (backend must be running on port 8080)
cd web
npm run generate-types
```

## Testing
`gz_test` is the local, all-suite helper that runs the common, backend, and web tests on your machine (it is recommended to run this before opening a PR); GitHub Actions runs the same set of suites centrally for each push/PR. Each suite groups tests that verify a specific layer of the app—see the detailed list below for what they cover.

```bash
# All suites via shell helpers (recommended)
gz_test               # common + backend + web in parallel

# Common (workflow.yml validation)
pytest tests/         # 28 tests

# Backend
pytest api/           # 62 tests across 10 files

# Web
cd web
npm test              # single run (CI) — 101 tests across 6 files
npm run test:watch    # watch mode
```

## Cloudinary image uploads (web)
Recommended: use backend-signed uploads so Cloudinary secrets never ship to the browser.
Set these in `.env.local` before starting Django:

```bash
export CLOUDINARY_CLOUD_NAME=<your-cloud-name>
export CLOUDINARY_API_KEY=<your-api-key>
export CLOUDINARY_API_SECRET=<your-api-secret>
export CLOUDINARY_UPLOAD_FOLDER=glaze         # optional
export CLOUDINARY_UPLOAD_PRESET=<your-upload-preset>  # optional
```

`WorkflowState` calls `POST /api/uploads/cloudinary/signature/` and uploads with the signed payload.
`CLOUDINARY_API_SECRET` stays server-only and is never returned to the client.

## Deployment
Glaze is configured to deploy on [Render.com](https://render.com/) with a Django backend and static Vite frontend. The deployment process builds the React production bundle and serves it alongside the Django API as a unified service.

### Environment variables
On Render, set these environment variables in your web service config:

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Django secret key (required on Render) |
| `DATABASE_URL` | PostgreSQL connection string (auto-provided by Render) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (if using image uploads) |
| `CLOUDINARY_API_KEY` | Cloudinary API key (if using image uploads) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret (if using image uploads) |

### Build and deployment
The [`build.sh`](build.sh) script handles the full deployment pipeline:
1. Installs Python and Node dependencies
2. Builds the Vite React production bundle
3. Collects Django static files
4. Configures WhiteNoise to serve the Vite output at the root URL

Render automatically runs this script when you push to the configured branch. The Vite-built frontend is served at `/` while Django API endpoints remain available at `/api/`.

### Configuration details
- **Database:** On Render, PostgreSQL is configured automatically via `DATABASE_URL` and `dj_database_url` in [`backend/settings.py`](backend/settings.py).
- **Static files:** WhiteNoise is configured to serve the Vite production build (in `web/dist/`) at the URL root so hardcoded asset paths like `/thumbnails/...` work correctly.
- **For more details:** See [Render's Django deployment guide](https://docs.render.com/deploy-django).

### What is tested

**Common** ([`tests/test_workflow.py`](tests/test_workflow.py)): structural validation of [`workflow.yml`](workflow.yml) against [`workflow.schema.yml`](workflow.schema.yml), semantic/referential integrity (successor references, reachability, terminal-state rules), `additional_fields` DSL rules (enum constraints, ref targets), and global/model alignment against [`api/models.py`](api/models.py).

**Backend** (`api/tests/`):
| File | What it covers |
|---|---|
| [`test_pieces_list.py`](api/tests/test_pieces_list.py) | `GET /api/pieces/` list endpoint |
| [`test_pieces_create.py`](api/tests/test_pieces_create.py) | `POST /api/pieces/` creation, location handling |
| [`test_piece_detail.py`](api/tests/test_piece_detail.py) | `GET /api/pieces/<id>/` detail endpoint |
| [`test_piece_states.py`](api/tests/test_piece_states.py) | `POST /api/pieces/<id>/states/` transitions, history, additional_fields |
| [`test_patch_current_state.py`](api/tests/test_patch_current_state.py) | `PATCH /api/pieces/<id>/state/` partial update, location, sealed-state protection |
| [`test_sealed_state.py`](api/tests/test_sealed_state.py) | ORM-level sealed state enforcement |
| [`test_additional_fields.py`](api/tests/test_additional_fields.py) | `PieceState.save()` schema validation for every field type (inline, state ref, global ref) |
| [`test_workflow_helpers.py`](api/tests/test_workflow_helpers.py) | Pure unit tests for [`api/workflow.py`](api/workflow.py) helpers (`get_state_ref_fields`, `get_global_model_and_field`, `build_additional_fields_schema`) — decoupled from real `workflow.yml` via `monkeypatch` |
| [`test_global_entries.py`](api/tests/test_global_entries.py) | `GET/POST /api/globals/<name>/` list and create |
| [`test_globals.py`](api/tests/test_globals.py) | Global/model alignment (every `globals` entry maps to a real Django model) |

**Web** (`web/src/` and `frontend_common/src/`):
| File | What it covers |
|---|---|
| [`frontend_common/src/workflow.test.ts`](frontend_common/src/workflow.test.ts) | `formatWorkflowFieldLabel`, `getGlobalDisplayField`, `getAdditionalFieldDefinitions` (inline, state ref, global ref) — decoupled from real `workflow.yml` via `vi.mock` |
| [`__tests__/GlobalFieldPicker.test.tsx`](web/src/components/__tests__/GlobalFieldPicker.test.tsx) | Rendering, internal fetch, provided options, create sentinel, inline creation (success/error), selecting existing |
| [`__tests__/PieceList.test.tsx`](web/src/components/__tests__/PieceList.test.tsx) | Column headers, empty state, per-row data, links |
| [`__tests__/NewPieceDialog.test.tsx`](web/src/components/__tests__/NewPieceDialog.test.tsx) | Rendering, name/notes/location/thumbnail, save/cancel behaviour |
| [`__tests__/WorkflowState.test.tsx`](web/src/components/__tests__/WorkflowState.test.tsx) | Notes, additional fields (inline, state ref, global ref), location, save button, unsaved indicator |
| [`__tests__/PieceDetail.test.tsx`](web/src/components/__tests__/PieceDetail.test.tsx) | Rendering, state transitions, confirmation dialog, location editing |

## Vibe coding / Contributing

Glaze uses Claude agents to handle issues and PR feedback autonomously. You don't need to clone the repo or write code to contribute.

### Open an issue → get a PR

1. **Open a GitHub issue** describing the feature or bug.
   - Be specific: what should happen, what currently happens, any relevant state names from [`workflow.yml`](workflow.yml).
2. **Apply the `claude` label** to the issue to invoke the agent.
   - Claude will read the issue and either ask clarifying questions (as a comment) or implement the change on a new branch and open a pull request.
3. **Answer any follow-up questions** Claude posts as issue comments.
   - Claude re-reads the full thread each time, so just reply naturally — no special trigger phrase needed.
4. **Review the pull request** Claude opens.
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

- Claude always runs `pytest` (backend) and `npm test` (web) before opening or updating a PR. If tests fail, it will not push.
- Claude derives all state names and transitions from [`workflow.yml`](workflow.yml) — you can reference state names freely in issues and it will use the correct values.
- For large or ambiguous requests, start with an issue rather than a direct PR comment so Claude can ask questions before writing code.

## Project structure

```
backend/          Django project settings, root URL config
api/              Models, serializers, views, tests
frontend_common/
  src/
    generated-types.ts  Auto-generated OpenAPI types (gitignored)
    types.ts            Shared domain types/constants for web + mobile
    api.ts              Shared HTTP calls; wire-type → domain-type mapping
    workflow.ts         Shared workflow helpers from workflow.yml
web/
  src/
    components/         React components
    App.tsx             Root component with MUI dark theme
workflow.yml     Source of truth for piece states and valid transitions
env.sh            Development shell helpers
```

The workflow state machine and all valid transitions are defined in [`workflow.yml`](workflow.yml). Both the backend and web derive state names and transition rules from this file — nothing is hardcoded elsewhere.

`workflow.yml` also contains two optional sections beyond the state list:

- **`globals`** — named domain types backed by Django models (e.g. `location`, `piece`), registered so they can be referenced from `additional_fields` and verified against `api/models.py` by the test suite.
- **`additional_fields`** (per-state) — state-specific fields declared using the embedded DSL. See the “Authoring `additional_fields`” section below for the exact syntax and how the web renders the inputs.

### Authoring `additional_fields`

When you add an `additional_fields` entry to a state in `workflow.yml`, the web automatically renders the inputs for you inside the `WorkflowState` component. Inline JSON primitives, state references, and global references are all interpreted through the helper utilities in [`frontend_common/src/workflow.ts`](frontend_common/src/workflow.ts) (`getAdditionalFieldDefinitions`, `formatWorkflowFieldLabel`, etc.) so the DSL does not need to be mentioned elsewhere in the code.

1. **Inline fields** (give the field a `type`, optional `description`, `required`, and/or `enum`). They render as `TextField`s—numbers as numeric inputs, booleans as selects with `True`/`False`, enums as dropdowns—directly below Notes and above the image list.
2. **State refs** (`$ref: "ancestor_state.field_name"`) carry a value forward from a reachable ancestor state; they render the referenced value while still allowing edits and backend validation just like inline fields.
3. **Global refs** (`$ref: "@global_name.field_name"`) render as `Autocomplete` pickers populated from `/api/globals/<name>/`. When a `global` entry sets `can_create: true`, the Autocomplete offers a “Create …” option and posts to `/api/globals/<name>/` to create the referenced object before the main Save action persists the new value.

Example snippets from `workflow.yml`:

```yaml
- id: wheel_thrown
  additional_fields:
    clay_weight_grams:
      type: number
      description: Weight of clay before throwing.
```
(*Inline field: renders as a numeric input.)

```yaml
  - id: trimmed
    additional_fields:
      pre_trim_weight_grams:
        $ref: "wheel_thrown.clay_weight_grams"
```
(*State ref: carries the earlier measurement forward.)

```yaml
  - id: wheel_thrown
    additional_fields:
      clay_body:
        $ref: "@clay_body.name"
        can_create: true
```
(*Global ref: renders an Autocomplete tied to the `clay_body` global, with inline creation.)

[`workflow.schema.yml`](workflow.schema.yml) enforces structural rules with JSON Schema (Draft 2020-12); [`tests/test_workflow.py`](tests/test_workflow.py) enforces semantic and referential integrity rules, including verifying that every declared global and its fields match the corresponding Django model in `api/models.py`.


## Using the App

Current web auth flow:

1. On app load, the client calls `/api/auth/me/`.
2. If authenticated, the user is routed into the main app shell.
3. If not authenticated, the login screen is shown.
4. After successful login, the app shell appears with a "Current user" chip and Log out button.

Sign-up behavior (temporary):

- The backend registration endpoint (`POST /api/auth/register/`) remains available.
- The web Sign Up action is intentionally disabled (`SIGN_UP_ENABLED = false` in [`web/src/App.tsx`](web/src/App.tsx)).
- For now, create users manually in Django admin.
