# Glaze — Agent Guide

## Project Overview

Glaze is a pottery workflow tracking application. Users log each pottery piece and record state transitions as the piece moves through the production lifecycle — from throwing or handbuilding through firing, glazing, and finishing. The history of state transitions is the primary data product; it can be analyzed per-piece or in aggregate.

The app has two parts:
- **Backend** (`/backend/`, `/api/`): Django + Django REST Framework, serves JSON to the web
- **Web** (`/web/`): React 19 + TypeScript + Vite + Material UI

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
- **Global/model alignment** (`TestGlobals`): verifies every `globals` entry maps to a real Django model in `api/models.py`, every field declared in that global exists on the model, and every global with `public: true` has a nullable `user` field on its model.

**`globals` section:** The optional top-level `globals` map registers named domain types backed by Django models. Each entry declares the model class name (PascalCase, verified against `api/models.py` by tests) and a subset of its fields exposed to the field DSL. `api/models.py` remains the authoritative source of truth — `globals` is a DSL-level view of those models, kept in sync by tests.

Each global definition also carries two optional boolean flags:
- `public` (default `false`): when `true`, this global type has an admin-managed shared library of public objects (stored with `user=NULL`) visible to all authenticated users. The corresponding Django model's `user` field must be nullable.
- `private` (default `true`): when `true`, users can create their own private instances of this type.

Currently `clay_body` and `glaze_type` have `public: true`; `location` and `glaze_method` are private-only. Models for public globals (`ClayBody`, `GlazeType`) allow `user=NULL`; public and private objects each have their own DB-level `UniqueConstraint` (conditional on `user IS NULL` / `user IS NOT NULL`). A private entry may share its name with a public entry — the two scopes are independent. Three helpers in `api/workflow.py` expose this information to the rest of the backend without leaking the private `_GLOBALS_MAP`:
- `is_public_global(name) -> bool` — returns `True` if the named global has `public: true`
- `get_public_global_models() -> list[type[Model]]` — returns the Django model class for every `public: true` global; used by admin for dynamic registration
- `get_image_fields_for_global_model(model_cls) -> list[str]` — returns field names declared as `type: image` for the given model class; used by admin to apply the Cloudinary upload widget

`TestGlobals` verifies — in addition to model/field alignment — that every `public: true` global has a nullable `user` field on its Django model.

**`additional_fields` DSL:** Each state may declare state-specific fields beyond the base `PieceState` fields using two forms:

*Inline field* — declares a new field directly on the state:
```yaml
clay_weight_grams:
  type: number          # string | number | integer | boolean | array | object | image
  description: "..."    # optional
  required: true        # optional, default false
  enum: [a, b, c]       # optional; only valid when type: string
```

The `image` type is a DSL-level annotation: it stores and validates the value as a URL string in JSON Schema (resolved to `type: string` by `_resolve_field_def`), but signals the Django admin to render a Cloudinary upload widget instead of a plain text input. Use `image` for any field that holds a Cloudinary-hosted image URL.

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
- Valid transitions are defined per-state in `workflow.yml`; validate against them on both the web and backend.

---

## Data Model

These types are defined in [`frontend_common/src/types.ts`](frontend_common/src/types.ts) and mirror what the backend API should produce.

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
{ url: string; caption: string; created: Date; cloudinary_public_id: string | null; }
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
- Serializer output must match the TypeScript types in `frontend_common/src/types.ts` exactly (field names, nesting).
- Validate state transitions server-side against `workflow.yml` before persisting a new `PieceState`.
- `workflow.yml` can be read at startup and cached; do not re-read it per request.
- CORS is installed (`corsheaders`); ensure it is in `MIDDLEWARE` and configured before shipping any cross-origin endpoint.
- Google OAuth is configured via `GOOGLE_OAUTH_CLIENT_ID` in environment settings; enables `POST /api/auth/google/` endpoint for JWT credential verification.
- The database is SQLite during development; avoid raw SQL.
- API auth is session-based (`SessionAuthentication`) with CSRF protection.
- User data isolation is mandatory: lists must scope to `request.user`, and object lookups must use user-filtered querysets.
- When a user requests another user's object ID, return `404` (not `403`) so object existence is not leaked.
- All global domain models inherit from `GlobalModel` (`api/models.py`), an abstract Django base class that:
  - Enforces user immutability: the `user` FK cannot change after creation (prevents silent breakage of public/private reference invariants).
  - Declares the `name` field convention: every concrete subclass must have a `name` CharField (or a stored computed equivalent). For `GlazeCombination`, `name` is auto-populated in `save()` by joining the two layer glaze type names with `GLAZE_COMBINATION_NAME_SEPARATOR` (`!`). `GlazeType.name` validation rejects the separator to prevent malformed combination names.
  - Maintains `GlobalModel._registry` — a list of every registered concrete subclass — for use in parameterised tests.
- Globals come in two visibility tiers:
  - **Private-only** (`Location`, `GlazeMethod`): owned by a single user; the `user` FK is NOT NULL; list endpoints filter to `request.user` only.
  - **Public + private** (`ClayBody`, `GlazeType`, `GlazeCombination`): these support an admin-managed shared library (records with `user=NULL`) as well as user-private records (when `private: true`). List endpoints return both the requesting user's private objects and all public objects. POST always creates a new private record (or returns the existing one for the requesting user); private entries may share a name with a public entry. The GET response includes an `is_public` boolean on each item so the frontend can disambiguate.
- Name uniqueness for public globals is enforced with two conditional DB constraints (one for private, one for public). Private and public scopes are independent — a user may have a private entry with the same name as a public entry.

**Django admin (`api/admin.py`):**

The admin is customized to support public library management:

- **`GlazeAdminSite`** — subclass of `admin.AdminSite` that overrides `get_app_list` to move public library models out of the "Api" section into a separate "Public Libraries" section on the admin homepage. Applied via `admin.site.__class__ = GlazeAdminSite` so all existing `@admin.register` calls remain unchanged. Only the homepage (`app_label=None`) is reorganized; app sub-pages (e.g. `/admin/api/`) are left intact.
- **`PublicLibraryAdmin`** — base `ModelAdmin` for globals with `public: true`. Filters the list view to public objects only (`user__isnull=True`); excludes the `user` field from forms (always null for public objects); forces `obj.user = None` on save; applies `_make_public_library_form` which rejects names that collide with existing private objects and lists the conflicting users.
- **`CloudinaryImageWidget`** — `TextInput` subclass that renders a text input, live thumbnail preview, and an "Upload Image" button when `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` are configured. Button is omitted when Cloudinary is not configured. Configuration is passed via `data-cloudinary-*` attributes read by the JS layer. The `Media` class loads the Cloudinary CDN script plus `api/static/admin/js/cloudinary_image_widget.js`.
- **`api/static/admin/js/cloudinary_image_widget.js`** — wires `.cloudinary-upload-btn` buttons to the Cloudinary Upload Widget on `DOMContentLoaded`. Reads `cloud_name`/`api_key` from `data-cloudinary-*` attributes; calls `/api/uploads/cloudinary/widget-signature/` (session + CSRF) for signing; writes `secure_url` to the text input and updates the preview on success.
- **Dynamic registration** — instead of a hardcoded list, `PublicLibraryAdmin` is registered for every model returned by `get_public_global_models()`. Adding `public: true` to a new global in `workflow.yml` is sufficient — no manual `admin.py` change required.

**API endpoints:**
- `GET /api/auth/csrf/` → set CSRF cookie
- `POST /api/auth/login/` → session login via email + password
- `POST /api/auth/logout/` → clear current session
- `GET /api/auth/me/` → current authenticated user
- `POST /api/auth/register/` → register + login (backend remains available)
- `POST /api/auth/google/` → Google OAuth 2.0 login via JWT credential
- `GET /api/pieces/` → list of `PieceSummary`
- `GET /api/pieces/<id>/` → `PieceDetail`
- `POST /api/pieces/` → create a new piece (always starts in `designed` state; accepts `name`, optional `thumbnail`, and optional `notes`)
- `POST /api/pieces/<id>/states/` → record a new state transition
- `PATCH /api/pieces/<id>/` → update piece-level editable fields (currently location)
- `PATCH /api/pieces/<id>/state/` → update current state's editable fields
- `GET /api/globals/<global_name>/` → list globals visible to the requesting user: for private-only globals, returns only the user's private objects; for public globals (`clay_body`, `glaze_type`), returns the user's private objects union all public objects (user=NULL), sorted by display field. Each item includes `is_public: bool`.
- `POST /api/globals/<global_name>/` → get-or-create a private record owned by the requesting user. For public globals, a private entry with the same name as a public entry is permitted — the two scopes are independent.
- `GET /api/uploads/cloudinary/widget-config/` → returns `{cloud_name, api_key, folder?}`; 503 if Cloudinary not configured
- `POST /api/uploads/cloudinary/widget-signature/` → accepts `{params_to_sign: {}}`, returns `{signature}`; used by the Upload Widget for signed uploads

---

## Web

**Stack**: React 19, TypeScript (strict), Vite 8, Material UI (MUI) v7, Axios

**Project layout:**
- [`web/src/components/`](web/src/components/) — UI components
- [`frontend_common/src/types.ts`](frontend_common/src/types.ts) — shared TypeScript types used by web and mobile
- [`frontend_common/src/api.ts`](frontend_common/src/api.ts) — shared HTTP client + wire/domain mappers
- [`frontend_common/src/workflow.ts`](frontend_common/src/workflow.ts) — shared workflow helpers derived from `workflow.yml`
- [`web/src/App.tsx`](web/src/App.tsx) — root component
- [`web/src/main.tsx`](web/src/main.tsx) — React entry point

**Conventions:**
- Use MUI components for all UI elements — avoid custom CSS except for layout adjustments MUI can't handle.
- Import shared types, API helpers, and workflow utilities using the `@common` path alias (`@common/types`, `@common/api`, `@common/workflow`) — never use relative `../../../frontend_common/src/...` paths or add per-app forwarding stubs. The alias is configured in each app's tsconfig `paths` and bundler config and resolves to `frontend_common/src/`.
- Import types from `@common/types`; do not redeclare them locally.
- State names and valid transitions come from `workflow.yml` via the constants in `@common/types` (`STATES`, `SUCCESSORS`) — do not hardcode them in components.
- All HTTP calls go through [`frontend_common/src/api.ts`](frontend_common/src/api.ts) (imported as `@common/api`). This is the single place where wire types (ISO date strings, etc.) are mapped to domain types as declared in `@common/types`. Components must never perform their own serialization or deserialization — they receive fully-typed domain objects and call the functions in `api.ts` to write data.
- Use Axios for all HTTP requests to the backend, and all HTTP requests should go through `@common/api`.
- Google OAuth is configured via `VITE_GOOGLE_CLIENT_ID` in environment settings; enables Google Sign-In button in the login form using `@react-oauth/google`.
- TypeScript strict mode is on; avoid `any`.
- New component files should be `.tsx`, not `.js`.
- Use `slotProps={{ htmlInput: { ... } }}` on MUI `TextField` — the `inputProps` prop is deprecated in MUI v7.
- Module-level constants should be named in `ALL_CAPS_SNAKE_CASE`. This applies to both exported constants (e.g. `DEFAULT_THUMBNAIL`) and internal ones (e.g. `MAX_NOTES_LENGTH`).

**Theming:**
- The app uses a MUI dark theme configured in [`web/src/App.tsx`](web/src/App.tsx) via `ThemeProvider` + `createTheme({ palette: { mode: 'dark' } })` with `CssBaseline`.
- Always use MUI theme tokens for color — never hardcode hex/rgb values. For text use `text.primary` (main content) and `text.secondary` (labels, metadata).

**Thumbnails:**
- Curated SVG thumbnails live in [`web/public/thumbnails/`](web/public/thumbnails/).
- All thumbnails share a consistent earth-tone pottery style: fill `#c8956c`, stroke `#7a4f3a`, `viewBox="0 0 100 100"`. New thumbnails must follow this convention.
- `DEFAULT_THUMBNAIL` (exported from `NewPieceDialog.tsx`) points to `/thumbnails/question-mark.svg` and is the pre-selected thumbnail when the piece creation dialog opens.

**Workflow config interface (`workflow.ts`):**
- [`frontend_common/src/workflow.ts`](frontend_common/src/workflow.ts) is the shared web/mobile counterpart to the backend's `_STATE_MAP` / `_GLOBALS_MAP` in `api/models.py`. It loads `workflow.yml` at build time and exposes typed helpers — do not duplicate state or globals data elsewhere.
- `getAdditionalFieldDefinitions(stateId)` — resolves per-state additional field definitions into a form-ready structure; used by `WorkflowState` to render dynamic fields.
- `getGlobalDisplayField(globalName)` — returns the display field name for a globals entry; used by `GlobalFieldPicker` to determine which field to write on create.
- `formatWorkflowFieldLabel(fieldName)` — converts snake_case DSL names to Title Case UI labels.

**Type generation pipeline:**
- [`frontend_common/src/generated-types.ts`](frontend_common/src/generated-types.ts) is auto-generated — do not edit by hand. It is gitignored.
- Generation is driven by [`web/scripts/generate-types.mjs`](web/scripts/generate-types.mjs), which calls the `openapi-typescript` programmatic API with a `transform` that converts `format: date-time` fields to `Date` in the generated output. Run `npm run generate-types` with Django on port 8080.
- [`frontend_common/src/types.ts`](frontend_common/src/types.ts) derives domain types from `generated-types.ts` via intersection (no `Omit<>`). It also holds the `STATES` array and `SUCCESSORS` map from `workflow.yml`, which are not in the schema.
- **When adding a new API field:** update the Django serializer → run `npm run generate-types` → update `frontend_common/src/types.ts` if semantic narrowing is needed → update mappers in `frontend_common/src/api.ts`.
- [`frontend_common/src/api.ts`](frontend_common/src/api.ts) uses the `Wire<T>` generic to type raw Axios responses (dates as strings). Mappers convert `Wire<T>` → domain `T` using `new Date()` and state casts. This is the only file that should contain deserialization logic.
- The OpenAPI schema is at `http://localhost:8080/api/schema/` and Swagger UI at `http://localhost:8080/api/schema/swagger/`.

**Existing components:**
- [`PieceList.tsx`](web/src/components/PieceList.tsx) — MUI table displaying a list of `PieceSummary` objects (columns: Thumbnail, Name, State, Created, Last Modified)
- [`NewPieceDialog.tsx`](web/src/components/NewPieceDialog.tsx) — dialog for creating a new piece; accepts a name, optional notes, and a thumbnail selected from the curated gallery
- [`WorkflowState.tsx`](web/src/components/WorkflowState.tsx) — edits the current `PieceState`: notes, location, workflow-specific additional fields, images (upload or URL), caption editing, and lightbox launch
- [`CloudinaryImage.tsx`](web/src/components/CloudinaryImage.tsx) — renders a `CaptionedImage` using `@cloudinary/url-gen` + `@cloudinary/react` when a Cloudinary identity is available; falls back to a plain `<img>`. Context prop controls sizing: `thumbnail` (64×64 fill), `preview` (64×64 fill), `lightbox` (90vw×80vh fit). Cloud name is parsed from the delivery URL for backwards compatibility with images that predate `cloudinary_public_id` storage.
- [`ImageLightbox.tsx`](web/src/components/ImageLightbox.tsx) — full-screen modal image viewer with caption, keyboard/touch navigation, and `CloudinaryImage` for optimized delivery

**Auth UI flow (`App.tsx`):**
- On load, the web app calls `fetchCurrentUser()` (`GET /api/auth/me/`).
- Authenticated users are shown the routed app shell (`RouterProvider` + data router) with current-user chip and logout action.
- Unauthenticated users are shown the login landing form with email/password fields and optional Google Sign-In button.
- Google Sign-In button appears when `VITE_GOOGLE_CLIENT_ID` is configured; uses `@react-oauth/google` for OAuth flow.
- `Sign Up` is intentionally disabled in the web UI (`SIGN_UP_ENABLED = false`) so accounts can be created manually in Django admin for now.

**Cloudinary image upload flow:**
- Images are attached to `PieceState` records and stored as a JSON array of `CaptionedImage` objects (url, caption, created, cloudinary_public_id).
- The upload UI in `WorkflowState` uses the [Cloudinary Upload Widget](https://cloudinary.com/documentation/upload_widget) loaded from CDN (`web/index.html`). Uploads are signed server-side so `CLOUDINARY_API_SECRET` never reaches the browser.
- Flow: `WorkflowState` calls `GET /api/uploads/cloudinary/widget-config/` → opens the widget → widget calls `POST /api/uploads/cloudinary/widget-signature/` for each signing request → on success, stores `secure_url` and `public_id` locally → user clicks "+ Add Image" → `PATCH /api/pieces/<id>/state/` persists the image array.
- `CloudinaryImage` uses `cloudinary_public_id` (when present) to construct optimized delivery URLs via `@cloudinary/url-gen`. If `cloudinary_public_id` is null (images uploaded before this field existed), the cloud name is parsed from the delivery URL as a fallback.
- Cloudinary is optional: if `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` are not set, the widget-config endpoint returns 503 and the UI falls back to URL-paste mode only.

**Google OAuth Flow:**
- **Frontend**: Uses `@react-oauth/google` to display Google Sign-In button when `VITE_GOOGLE_CLIENT_ID` is configured in environment.
- **Authentication**: User clicks button, Google handles OAuth flow and returns JWT credential to frontend.
- **Backend Verification**: Frontend sends JWT to `POST /api/auth/google/`, Django verifies token with Google's servers using `google-auth` library.
- **User Management**: 
  - Looks up existing user by Google subject ID (`UserProfile.openid_subject`)
  - Falls back to email matching for graceful migration from email/password accounts
  - Creates new Google-only account if no match found (unusable password)
- **Profile Sync**: Updates user profile information (name, picture) from Google on each login.
- **Session**: Creates Django session and returns authenticated user data.

---

## Development Setup

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8080

# Web
cd web
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

Tests live in [`api/tests/`](api/tests/). `pytest.ini` points pytest at `backend.settings` automatically — no extra configuration needed.

### Web

```bash
cd web
npm install
npm test          # single run (used in CI)
npm run test:watch  # watch mode for development
```

Tests live in two places:
- [`web/src/components/__tests__/`](web/src/components/__tests__/) — component tests (jsdom + Testing Library)
- [`frontend_common/src/workflow.test.ts`](frontend_common/src/workflow.test.ts) — unit tests for `workflow.ts` helpers (picked up by the web vitest config via an explicit `include` glob)

The test environment is jsdom; setup file is [`web/src/test-setup.ts`](web/src/test-setup.ts).

**`workflow.ts` tests** use `vi.mock('../../workflow.yml', ...)` with a minimal fixture to decouple them from the real `workflow.yml`. This lets edge cases (globals with no `name` field, unknown states, state refs) be tested in isolation. Never import `workflow.yml` directly in a test — always mock it.

**Component tests** that involve typing into a controlled MUI Autocomplete must use a stateful wrapper (see `Controlled` in `GlobalFieldPicker.test.tsx`) because `inputValue={value}` means the mock `onChange: vi.fn()` never updates the value, so the component never sees the typed text.

### CI

GitHub Actions runs all three suites (`common`, `backend`, `web`) in parallel on every push and pull request — see [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml). A PR should not be merged if any job is red.

### What to test

- Any change to `workflow.yml` or `workflow.schema.yml` → verify `pytest tests/` passes.
- Every new API endpoint or serializer change → add or update a test in the appropriate file under `api/tests/`.
- Every new or modified React component → add or update a test in `web/src/components/__tests__/`.
- Every new or modified `workflow.ts` helper → add or update a test in `frontend_common/src/workflow.test.ts`, mocking `workflow.yml` with a minimal fixture.
- Every new or modified `api/workflow.py` helper → add or update a test in `api/tests/test_workflow_helpers.py`, patching `_STATE_MAP` / `_GLOBALS_MAP` via `monkeypatch`.
- The `piece` fixture in `api/tests/conftest.py` creates a piece via the ORM directly; prefer the API client (`client.post(...)`) for tests that exercise request/response behaviour.
- **New global domain models**: adding a new concrete `GlobalModel` subclass automatically enrolls it in the parameterised test suites in `api/tests/test_globals.py` (user immutability, `name` field presence, workflow registry consistency). No manual test additions are needed for these invariants — focus new tests on model-specific constraints and API behaviour instead.

---

## Key Constraints

- `workflow.yml` is the single source of truth for states and transitions. Both backend validation and web UI must derive from it — never duplicate the state list.
- The `PieceState` history is append-only; past states should not be edited, only new ones added. Only the `current_state` should be modifiable. Once a piece has transitioned to a new state, past states should be considered sealed, and care should be taken in the backend code to prevent inadvertent edits to these sealed states.
- `PieceDetail.current_state` is the most recent `PieceState` in the history.
- All dates should be stored and transmitted as ISO 8601 strings; the web types declare them as `Date` but Axios/JSON deserialization will deliver them as strings — handle accordingly.
- **Piece creation flow:** When creating a new piece (`POST /api/pieces/`), the piece is always initialized in the `designed` state. The creation UI (`NewPieceDialog`) lets the user supply a name, optional notes, and pick a thumbnail from the curated gallery in `web/public/thumbnails/`. The selected thumbnail URL is stored as the piece's primary visual identifier.
- **Public library ownership:** Public global objects (`user=NULL` on `ClayBody`, `GlazeType`) are owned by no user and managed exclusively via Django admin. Regular API users can read public objects but cannot create, edit, or delete them. The `public: true` flag in `workflow.yml` is the single source of truth for which globals support a public library — do not hardcode this distinction in application code; use `is_public_global()` from `api/workflow.py`.

---

## Agent conventions

These rules apply to all autonomous agents (issue agent, PR agent) working in this repository, as well as interactive sessions that are prompted to "create a commit" or "create a PR" by the user.

### Branch naming

Name branches `issue/<N>-short-slug` when opening a branch in response to a GitHub issue (e.g. `issue/42-fix-glazed-transition`). For other work use `<type>/short-slug` (`fix/`, `feat/`, `docs/`, etc.).

### Scope limits — ask before acting

Do not take the following actions autonomously without an explicit instruction in the issue or PR thread:

- Modifying [`workflow.yml`](workflow.yml) (state definitions, transitions, successors)
- Modifying [`.github/workflows/`](.github/workflows/) (CI/CD configuration)
- Adding or removing Python dependencies (`requirements*.txt`)
- Adding or removing npm dependencies (`package.json`)
- Writing or altering database migrations
- Modifying deployment configuration, [`backend/settings.py`](backend/settings.py) or build settings [`build.sh`](build.sh).
- Destructive git operations (force push, branch deletion)

If an issue seems to require one of these, post a comment asking for confirmation before proceeding.

### PR ownership label

When you open a pull request, apply the `claude` label immediately after creation if you are `claude` and `codex` if you are `codex`, etc...:

```bash
gh pr create --title "..." --body "..."
gh pr edit <number> --add-label claude
```

The agent label (e.g. `claude`) tells the corresponding agent workflow (e.g. Claude PR Agent) that this PR is under its respective stewardship, which enables:
- Responding to `@claude` mentions with code changes (not just comments)
- `address-review-changes` to fire when a reviewer requests changes

If the label doesn't exist in the repo yet, create it first: `gh label create claude --color 5319e7`.

### Definition of done

Before opening or pushing to a PR, verify every item:

- Ask yourself if there are obvious cases of redundant or copy-pasted code. For example, at every new or modified call site for a function, confirm whether the information provided at the call site is still necessary, or if it is already known by the callee and can be removed.
- Authored commits should have the appropriate `Co-authored-by:` tag. If you are codex, use `Co-authored-by: Codex <codex@openai.com>` if you are Claude, use `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`, etc...Include the model version if possible.
- Every commit should have a short descriptive title with detailed bullets in the commit body explaining what was done and why.
- If a PR is to be opened with requested functional changes that require refactoring to existing frontend or backend components, please indicate this in the commit and PR description with clear descriptions of what was changed in addition to the requested functional changes.
- All three test suites pass: `pytest tests/` (common), `pytest api/` (backend), `cd web && npm test` (web).
- The production build should succeed: `./build.sh`
- PR body contains "Closes #<N>" linking to the originating issue
- PR title is concise (under 70 characters)
- No debug code, temporary workarounds, or stray `print`/`console.log` statements left in
- Serializer output matches the TypeScript types in [`frontend_common/src/types.ts`](frontend_common/src/types.ts)
- State names and transitions are derived from [`workflow.yml`](workflow.yml), not hardcoded
- If `AGENTS.md` was modified, check whether [`README.md`](README.md) needs a corresponding update (the Contributing section and any user-facing descriptions of agent behaviour)
- If during the process of creating the content commits for a PR, you notice implied changes to conventions or constraints that should be respected going forward, please automatically append an additional change to AGENTS.md and/or README.md in a follow-up commit with appropriate descriptions and justifications in the commit.
