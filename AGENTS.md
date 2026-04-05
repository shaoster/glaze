# Glaze — Agent Guide

## Project Overview

Glaze is a pottery workflow tracking application. Users log each pottery piece and record state transitions as the piece moves through the production lifecycle — from throwing or handbuilding through firing, glazing, and finishing. The history of state transitions is the primary data product; it can be analyzed per-piece or in aggregate.

The app has two parts:
- **Backend** (`/backend/`, `/api/`): Django + Django REST Framework, serves JSON to the frontend
- **Frontend** (`/frontend/`): React 19 + TypeScript + Vite + Material UI

---

## Workflow State Machine

The source of truth for piece states is [`workflow.yml`](workflow.yml) at the project root. Do not hardcode state names or transitions anywhere — always derive them from this file.

**Schema and validation:** [`workflow.schema.yml`](workflow.schema.yml) is a JSON Schema (Draft 2020-12) document (written in YAML) that defines the allowed structure of `workflow.yml`. It constrains:
- Top-level required fields: `version` (semver string) and `states` (array, at least 2 items). `globals` is optional.
- Per-state required fields: `id` (snake_case, `^[a-z][a-z0-9_]*$`) and `visible` (boolean).
- Optional per-state fields: `terminal` (boolean), `successors` (array of snake_case strings, no duplicates within a state), `additional_fields` (map of field DSL entries).
- `additionalProperties: false` at both the top level and per-state — unknown keys are rejected.

[`tests/test_workflow.py`](tests/test_workflow.py) is the common test suite that validates `workflow.yml` in full — both structurally and semantically:
- **Structural** (`TestSchemaValidation`): runs `jsonschema.validate` against `workflow.schema.yml`, and verifies that malformed inputs (missing fields, bad version format, invalid ID patterns, duplicate successors, unknown keys) are correctly rejected.
- **Semantic** (`TestReferentialIntegrity`): enforces rules JSON Schema cannot express — every successor ID references a real state, terminal states have no successors, non-terminal states have at least one successor, all state IDs are unique, no state lists itself as a successor.
- **DSL referential integrity** (`TestAdditionalFieldsDSL`): enforces `additional_fields` rules — `enum` only on `type: string` fields; state refs point to known states with declared fields that are reachable ancestors; global refs point to declared globals with declared fields.
- **Global/model alignment** (`TestGlobals`): verifies every `globals` entry maps to a real Django model in `api/models.py`, and every field declared in that global exists on the model.

**`globals` section:** The optional top-level `globals` map registers named domain types backed by Django models. Each entry declares the model class name (PascalCase, verified against `api/models.py` by tests) and a subset of its fields exposed to the field DSL. `api/models.py` remains the authoritative source of truth — `globals` is a DSL-level view of those models, kept in sync by tests.

**`additional_fields` DSL:** Each state may declare state-specific fields beyond the base `PieceState` fields using two forms:

*Inline field* — declares a new field directly on the state:
```yaml
clay_weight_grams:
  type: number          # string | number | integer | boolean | array | object
  description: "..."    # optional
  required: true        # optional, default false
  enum: [a, b, c]       # optional; only valid when type: string
```

*Ref field* — two sub-forms, distinguished by the `@` prefix:
```yaml
# State ref — carries a field forward from a reachable ancestor state:
pre_trim_weight_grams:
  $ref: "wheel_thrown.clay_weight_grams"
  description: "..."    # optional override
  required: false       # optional override

# Global ref — foreign-key reference to a field on a globals entry
# (backed by a Django model). @ marks this as a global ref:
kiln_location:
  $ref: "@location.name"
  description: "..."    # optional override
  required: true        # optional override
  can_create: true      # optional; default false — allows inline creation of a new global instance
```

Referential rules enforced by `TestAdditionalFieldsDSL`:
- **State refs** (`state_id.field_name`): state must exist, field must be declared on it, state must be a reachable ancestor (path through the successor graph from that state to this one).
- **Global refs** (`@global_name.field_name`): global must be declared in `globals`, field must be declared in that global's `fields`.

**States** (in rough lifecycle order):

| State | Description |
|---|---|
| `designed` | Piece conceived/designed — universal entry point |
| `wheel_thrown` | Piece created on the wheel |
| `handbuilt` | Piece hand-sculpted |
| `trimmed` | Wheel-thrown piece trimmed |
| `slip_applied` | Decorative slip added |
| `carved` | Surface carved or decorated |
| `submitted_to_bisque_fire` | Ready for initial firing |
| `bisque_fired` | Initial bisque fire complete |
| `waxed` | Wax resist applied before glazing |
| `glazed` | Glaze applied |
| `submitted_to_glaze_fire` | Ready for glaze firing |
| `glaze_fired` | Glaze fire complete |
| `sanded` | Final sanding/finishing |
| `completed` | Terminal — finished piece |
| `recycled` | Terminal — piece discarded or clay reclaimed |

**Rules:**
- `designed` is the single entry point for all new pieces — `POST /api/pieces/` always creates a piece in the `designed` state.
- Every non-terminal state has `recycled` as a valid successor — a piece can be recycled at any point.
- `completed` and `recycled` are terminal states (`"terminal": true`) — no transitions out.
- During initial development, all states have `"visible": true` and should be shown in the UI. As additional features are added, some states may become hidden and only available for analysis purposes, but are not shown in the UI by default.
- Valid transitions are defined per-state in `workflow.yml`; validate against them on both the frontend and backend.

---

## Data Model

These types are defined in [`frontend/src/types.ts`](frontend/src/types.ts) and mirror what the backend API should produce.

**`PieceSummary`** — used in list views
```ts
{
  id: string;
  name: string;
  created: Date;
  last_modified: Date;
  thumbnail: string;
  current_state: State;   // just the state name
  current_location?: Location; // reference to the Location global object.
}
```

**`PieceState`** — a single recorded workflow step
```ts
{
  state: State;
  notes: string;
  created: Date;
  last_modified: Date;
  images: [CaptionedImage];
  previous_state?: State;
  next_state?: State;
}
```

**`PieceDetail`** — used in detail views; extends `PieceSummary`
```ts
PieceSummary & {
  current_state: PieceState;  // full state object, not just name
  history: [PieceState];
}
```

**`CaptionedImage`**
```ts
{ url: string; caption: string; created: Date; }
```

---

## Backend

**Stack**: Django 6, Django REST Framework, SQLite (dev), django-cors-headers

**Project layout:**
- [`backend/`](backend/) — Django project settings, root URL config, WSGI/ASGI
- [`api/`](api/) — the single Django app; models, views, serializers all live here
- [`manage.py`](manage.py) — Django management entrypoint

**Conventions:**
- All API endpoints live under the `api` app and are registered in `backend/urls.py`.
- Use DRF serializers for all request/response shaping — no raw `JsonResponse` with hand-built dicts.
- Serializer output must match the TypeScript types in `types.ts` exactly (field names, nesting).
- Validate state transitions server-side against `workflow.yml` before persisting a new `PieceState`.
- `workflow.yml` can be read at startup and cached; do not re-read it per request.
- CORS is installed (`corsheaders`); ensure it is in `MIDDLEWARE` and configured before shipping any cross-origin endpoint.
- The database is SQLite during development; avoid raw SQL.

**API endpoints:**
- `GET /api/pieces/` → list of `PieceSummary`
- `GET /api/pieces/<id>/` → `PieceDetail`
- `POST /api/pieces/` → create a new piece (always starts in `designed` state; accepts `name`, optional `thumbnail`, and optional `notes`)
- `POST /api/pieces/<id>/states/` → record a new state transition

---

## Frontend

**Stack**: React 19, TypeScript (strict), Vite 8, Material UI (MUI) v7, Axios

**Project layout:**
- [`frontend/src/components/`](frontend/src/components/) — UI components
- [`frontend/src/types.ts`](frontend/src/types.ts) — all shared TypeScript types
- [`frontend/src/App.tsx`](frontend/src/App.tsx) — root component
- [`frontend/src/main.tsx`](frontend/src/main.tsx) — React entry point

**Conventions:**
- Use MUI components for all UI elements — avoid custom CSS except for layout adjustments MUI can't handle.
- Import types from `types.ts`; do not redeclare them locally.
- State names and valid transitions come from `workflow.yml` via the constants in `types.ts` (`STATES`, `SUCCESSORS`) — do not hardcode them in components.
- All HTTP calls go through [`frontend/src/api.ts`](frontend/src/api.ts). This is the single place where wire types (ISO date strings, etc.) are mapped to domain types as declared in `types.ts`. Components must never perform their own serialization or deserialization — they receive fully-typed domain objects and call the functions in `api.ts` to write data.
- Use Axios for all HTTP requests to the backend, and all HTTP requests should go through `api.ts`.
- TypeScript strict mode is on; avoid `any`.
- New component files should be `.tsx`, not `.js`.
- Use `slotProps={{ htmlInput: { ... } }}` on MUI `TextField` — the `inputProps` prop is deprecated in MUI v7.

**Theming:**
- The app uses a MUI dark theme configured in [`frontend/src/App.tsx`](frontend/src/App.tsx) via `ThemeProvider` + `createTheme({ palette: { mode: 'dark' } })` with `CssBaseline`.
- Always use MUI theme tokens for color — never hardcode hex/rgb values. For text use `text.primary` (main content) and `text.secondary` (labels, metadata).

**Thumbnails:**
- Curated SVG thumbnails live in [`frontend/public/thumbnails/`](frontend/public/thumbnails/).
- All thumbnails share a consistent earth-tone pottery style: fill `#c8956c`, stroke `#7a4f3a`, `viewBox="0 0 100 100"`. New thumbnails must follow this convention.
- `DEFAULT_THUMBNAIL` (exported from `NewPieceDialog.tsx`) points to `/thumbnails/question-mark.svg` and is the pre-selected thumbnail when the piece creation dialog opens.

**Type generation pipeline:**
- [`frontend/src/generated-types.ts`](frontend/src/generated-types.ts) is auto-generated — do not edit by hand. It is gitignored.
- Generation is driven by [`frontend/scripts/generate-types.mjs`](frontend/scripts/generate-types.mjs), which calls the `openapi-typescript` programmatic API with a `transform` that converts `format: date-time` fields to `Date` in the generated output. Run `npm run generate-types` with Django on port 8080.
- [`frontend/src/types.ts`](frontend/src/types.ts) derives domain types from `generated-types.ts` via intersection (no `Omit<>`). It also holds the `STATES` array and `SUCCESSORS` map from `workflow.yml`, which are not in the schema.
- **When adding a new API field:** update the Django serializer → run `npm run generate-types` → update `types.ts` if semantic narrowing is needed → update mappers in `api.ts`.
- [`frontend/src/api.ts`](frontend/src/api.ts) uses the `Wire<T>` generic to type raw Axios responses (dates as strings). Mappers convert `Wire<T>` → domain `T` using `new Date()` and state casts. This is the only file that should contain deserialization logic.
- The OpenAPI schema is at `http://localhost:8080/api/schema/` and Swagger UI at `http://localhost:8080/api/schema/swagger/`.

**Existing components:**
- [`PieceList.tsx`](frontend/src/components/PieceList.tsx) — MUI table displaying a list of `PieceSummary` objects (columns: Thumbnail, Name, State, Created, Last Modified)
- [`NewPieceDialog.tsx`](frontend/src/components/NewPieceDialog.tsx) — dialog for creating a new piece; accepts a name, optional notes, and a thumbnail selected from the curated gallery
- [`WorkflowState.tsx`](frontend/src/components/WorkflowState.tsx) — placeholder for rendering a single `PieceState`; not yet implemented

---

## Development Setup

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8080

# Frontend
cd frontend
npm install
npm run dev
```

---

## Testing

**All proposed changes must pass the full test suite before being submitted.**

### Common (workflow validation)

```bash
pip install -r requirements-dev.txt
pytest tests/                          # run from the repo root
```

Tests live in [`tests/test_workflow.py`](tests/test_workflow.py). This suite validates `workflow.yml` both structurally (via `jsonschema` against `workflow.schema.yml`) and semantically (referential integrity checks that JSON Schema cannot express). Run this suite whenever `workflow.yml` or `workflow.schema.yml` is modified.

### Backend

```bash
pip install -r requirements-dev.txt   # includes pytest and pytest-django
pytest api/                            # run from the repo root
```

Tests live in [`api/tests.py`](api/tests.py). `pytest.ini` points pytest at `backend.settings` automatically — no extra configuration needed.

### Frontend

```bash
cd frontend
npm install
npm test          # single run (used in CI)
npm run test:watch  # watch mode for development
```

Tests live in [`frontend/src/components/__tests__/`](frontend/src/components/__tests__/). The test environment is jsdom; setup file is [`frontend/src/test-setup.ts`](frontend/src/test-setup.ts).

### CI

GitHub Actions runs all three suites (`common`, `backend`, `frontend`) in parallel on every push and pull request — see [`.github/workflows/tests.yml`](.github/workflows/tests.yml). A PR should not be merged if any job is red.

### What to test

- Any change to `workflow.yml` or `workflow.schema.yml` → verify `pytest tests/` passes.
- Every new API endpoint or serializer change → add or update a test in `api/tests.py`.
- Every new or modified React component → add or update a test in `frontend/src/components/__tests__/`.
- The `piece` fixture in `api/tests.py` creates a piece via the ORM directly; prefer the API client (`client.post(...)`) for tests that exercise request/response behaviour.

---

## Key Constraints

- `workflow.yml` is the single source of truth for states and transitions. Both backend validation and frontend UI must derive from it — never duplicate the state list.
- The `PieceState` history is append-only; past states should not be edited, only new ones added. Only the `current_state` should be modifiable. Once a piece has transitioned to a new state, past states should be considered sealed, and care should be taken in the backend code to prevent inadvertent edits to these sealed states.
- `PieceDetail.current_state` is the most recent `PieceState` in the history.
- All dates should be stored and transmitted as ISO 8601 strings; the frontend types declare them as `Date` but Axios/JSON deserialization will deliver them as strings — handle accordingly.
- **Piece creation flow:** When creating a new piece (`POST /api/pieces/`), the piece is always initialized in the `designed` state. The creation UI (`NewPieceDialog`) lets the user supply a name, optional notes, and pick a thumbnail from the curated gallery in `frontend/public/thumbnails/`. The selected thumbnail URL is stored as the piece's primary visual identifier.
