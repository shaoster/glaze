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
| `gz_test` | Run all three test suites (common, backend, frontend) in parallel. Exits non-zero if any fails. |
| `gz_test_common` | Run workflow schema/integrity tests only (`pytest tests/`). |
| `gz_test_backend` | Run Django API tests only (`pytest api/`). |
| `gz_test_frontend` | Run frontend tests only (`npm test`). |

### Type generation

| Command | Description |
|---|---|
| `gz_gentypes` | Regenerate `frontend/src/generated-types.ts` from the live OpenAPI schema. Starts the backend temporarily if it is not already running. |

Run `gz_help` to print the full list of shortcuts at any time.

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
# All suites via shell helpers (recommended)
gz_test               # common + backend + frontend in parallel

# Common (workflow.yml validation)
pytest tests/         # 28 tests

# Backend
pytest api/           # 62 tests across 10 files

# Frontend
cd frontend
npm test              # single run (CI) — 101 tests across 6 files
npm run test:watch    # watch mode
```

### What is tested

**Common** (`tests/test_workflow.py`): structural validation of `workflow.yml` against `workflow.schema.yml`, semantic/referential integrity (successor references, reachability, terminal-state rules), `additional_fields` DSL rules (enum constraints, ref targets), and global/model alignment against `api/models.py`.

**Backend** (`api/tests/`):
| File | What it covers |
|---|---|
| `test_pieces_list.py` | `GET /api/pieces/` list endpoint |
| `test_pieces_create.py` | `POST /api/pieces/` creation, location handling |
| `test_piece_detail.py` | `GET /api/pieces/<id>/` detail endpoint |
| `test_piece_states.py` | `POST /api/pieces/<id>/states/` transitions, history, additional_fields |
| `test_patch_current_state.py` | `PATCH /api/pieces/<id>/state/` partial update, location, sealed-state protection |
| `test_sealed_state.py` | ORM-level sealed state enforcement |
| `test_additional_fields.py` | `PieceState.save()` schema validation for every field type (inline, state ref, global ref) |
| `test_global_entries.py` | `GET/POST /api/globals/<name>/` list and create |
| `test_globals.py` | Global/model alignment (every `globals` entry maps to a real Django model) |

**Frontend** (`frontend/src/`):
| File | What it covers |
|---|---|
| `workflow.test.ts` | `formatWorkflowFieldLabel`, `getGlobalDisplayField`, `getAdditionalFieldDefinitions` (inline, state ref, global ref) — decoupled from real `workflow.yml` via `vi.mock` |
| `__tests__/GlobalFieldPicker.test.tsx` | Rendering, internal fetch, provided options, create sentinel, inline creation (success/error), selecting existing |
| `__tests__/PieceList.test.tsx` | Column headers, empty state, per-row data, links |
| `__tests__/NewPieceDialog.test.tsx` | Rendering, name/notes/location/thumbnail, save/cancel behaviour |
| `__tests__/WorkflowState.test.tsx` | Notes, additional fields (inline, state ref, global ref), location, save button, unsaved indicator |
| `__tests__/PieceDetail.test.tsx` | Rendering, state transitions, confirmation dialog, location editing |

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

`workflow.yml` also contains two optional sections beyond the state list:

- **`globals`** — named domain types backed by Django models (e.g. `location`, `piece`), registered so they can be referenced from `additional_fields` and verified against `api/models.py` by the test suite.
- **`additional_fields`** (per-state) — state-specific fields declared using the embedded DSL. See the “Authoring `additional_fields`” section below for the exact syntax and how the frontend renders the inputs.

### Authoring `additional_fields`

When you add an `additional_fields` entry to a state in `workflow.yml`, the frontend automatically renders the inputs for you inside the `WorkflowState` component. Inline JSON primitives, state references, and global references are all interpreted through the helper utilities in `frontend/src/workflow.ts` (`getAdditionalFieldDefinitions`, `formatWorkflowFieldLabel`, etc.) so the DSL does not need to be mentioned elsewhere in the code.

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


# Using the App

TBD
