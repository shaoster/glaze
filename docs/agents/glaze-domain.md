# Glaze — Domain Logic

## Project Overview

Glaze is a pottery workflow tracking application. Users log each pottery piece and record state transitions as the piece moves through the production lifecycle — from throwing or handbuilding through firing, glazing, and finishing. The history of state transitions is the primary data product; it can be analyzed per-piece or in aggregate.

The app has two parts:
- **Backend** (`/backend/`, `/api/`): Django + Django REST Framework, serves JSON to the web
- **Web** (`/web/`): React 19 + TypeScript + Vite + Material UI

---

## Workflow State Machine

The source of truth for piece states is [`workflow.yml`](../../workflow.yml) at the project root. Do not hardcode state names or transitions anywhere — always derive them from this file.

**Schema and validation:** [`workflow.schema.yml`](../../workflow.schema.yml) is a JSON Schema (Draft 2020-12) document (written in YAML) that defines the allowed structure of `workflow.yml`. It constrains:
- Top-level required fields: `version` (semver string) and `states` (array, at least 2 items). `globals` is optional.
- Per-state required fields: `id` (snake_case, `^[a-z][a-z0-9_]*$`) and `visible` (boolean).
- Optional per-state fields: `terminal` (boolean), `successors` (array of snake_case strings, no duplicates within a state), `additional_fields` (map of field DSL entries).
- `additionalProperties: false` at both the top level and per-state — unknown keys are rejected.

[`tests/test_workflow.py`](../../tests/test_workflow.py) is the common test suite that validates `workflow.yml` in full — both structurally and semantically:
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

These types are defined in [`frontend_common/src/types.ts`](../../frontend_common/src/types.ts) and mirror what the backend API should produce.

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

## Backend Conventions (Glaze-specific)

These supplement the generic Django/DRF conventions.

**`GlobalModel` abstract base class** (`api/models.py`): all global domain models inherit from it.
- Enforces user immutability: the `user` FK cannot change after creation (prevents silent breakage of public/private reference invariants).
- Declares the `name` field convention: every concrete subclass must have a `name` CharField (or a stored computed equivalent). For `GlazeCombination`, `name` is auto-populated in `save()` by joining the two layer glaze type names with `GLAZE_COMBINATION_NAME_SEPARATOR` (`!`). `GlazeType.name` validation rejects the separator to prevent malformed combination names.
- Maintains `GlobalModel._registry` — a list of every registered concrete subclass — for use in parameterised tests.

**Globals visibility tiers:**
- **Private-only** (`Location`, `GlazeMethod`): owned by a single user; the `user` FK is NOT NULL; list endpoints filter to `request.user` only.
- **Public + private** (`ClayBody`, `GlazeType`, `GlazeCombination`): support an admin-managed shared library (records with `user=NULL`) as well as user-private records. List endpoints return both the requesting user's private objects and all public objects. POST always creates a new private record (or returns the existing one for the requesting user). The GET response includes an `is_public` boolean on each item so the frontend can disambiguate.

Name uniqueness for public globals is enforced with two conditional DB constraints (one for private, one for public). Private and public scopes are independent — a user may have a private entry with the same name as a public entry.

**Django admin (`api/admin.py`):**
- **`GlazeAdminSite`** — subclass of `admin.AdminSite` that overrides `get_app_list` to move public library models out of the "Api" section into a separate "Public Libraries" section. Applied via `admin.site.__class__ = GlazeAdminSite`.
- **`PublicLibraryAdmin`** — base `ModelAdmin` for globals with `public: true`. Filters to public objects only (`user__isnull=True`); forces `obj.user = None` on save; rejects names that collide with existing private objects.
- **`CloudinaryImageWidget`** — `TextInput` subclass rendering a text input, thumbnail preview, and "Upload Image" button when Cloudinary is configured. The `Media` class loads the Cloudinary CDN script plus `api/static/admin/js/cloudinary_image_widget.js`.
- **`api/static/admin/js/cloudinary_image_widget.js`** — wires upload buttons to the Cloudinary Upload Widget; calls `/api/uploads/cloudinary/widget-signature/` for signing.
- **Dynamic registration** — `PublicLibraryAdmin` is registered for every model returned by `get_public_global_models()`. Adding `public: true` to a new global in `workflow.yml` is sufficient.

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
- `GET /api/globals/<global_name>/` → list globals visible to the requesting user
- `POST /api/globals/<global_name>/` → get-or-create a private record owned by the requesting user
- `GET /api/uploads/cloudinary/widget-config/` → returns `{cloud_name, api_key, folder?}`; 503 if Cloudinary not configured
- `POST /api/uploads/cloudinary/widget-signature/` → accepts `{params_to_sign: {}}`, returns `{signature}`

**Google OAuth backend:**
- Verifies JWT with Google's servers using `google-auth` library (`GOOGLE_OAUTH_CLIENT_ID` env var).
- Looks up existing user by `UserProfile.openid_subject`; falls back to email matching for migration from email/password accounts; creates new Google-only account if no match found.
- Updates user profile (name, picture) from Google on each login and creates a Django session.

**Backend testing — Glaze-specific guidance:**
- The `piece` fixture in `api/tests/conftest.py` creates a piece via the ORM directly; prefer the API client (`client.post(...)`) for tests that exercise request/response behaviour.
- Every new API endpoint or serializer change → add or update a test under `api/tests/`.
- Every new or modified `api/workflow.py` helper → add or update a test in `api/tests/test_workflow_helpers.py`, patching `_STATE_MAP` / `_GLOBALS_MAP` via `monkeypatch`.
- **New global domain models**: adding a new concrete `GlobalModel` subclass automatically enrolls it in the parameterised test suites in `api/tests/test_globals.py`. No manual test additions needed for registry invariants — focus new tests on model-specific constraints and API behaviour instead.

---

## Frontend Conventions (Glaze-specific)

These supplement the generic TypeScript/React/Vite conventions.

**Shared module alias:** Import shared types, API helpers, and workflow utilities using the `@common` path alias (`@common/types`, `@common/api`, `@common/workflow`) — never use relative `../../../frontend_common/src/...` paths. The alias resolves to `frontend_common/src/` and is configured in each app's tsconfig `paths` and bundler config.

**State names and transitions:** Come from `workflow.yml` via the constants in `@common/types` (`STATES`, `SUCCESSORS`) — do not hardcode them in components.

**HTTP calls:** All go through [`frontend_common/src/api.ts`](../../frontend_common/src/api.ts) (imported as `@common/api`). This is the single place where wire types (ISO date strings, etc.) are mapped to domain types. Components must never perform their own serialization or deserialization.

**Workflow config interface (`workflow.ts`):**
[`frontend_common/src/workflow.ts`](../../frontend_common/src/workflow.ts) loads `workflow.yml` at build time and exposes typed helpers — do not duplicate state or globals data elsewhere.
- `getAdditionalFieldDefinitions(stateId)` — resolves per-state additional field definitions into a form-ready structure; used by `WorkflowState` to render dynamic fields.
- `getGlobalDisplayField(globalName)` — returns the display field name for a globals entry; used by `GlobalFieldPicker` to determine which field to write on create.
- `formatWorkflowFieldLabel(fieldName)` — converts snake_case DSL names to Title Case UI labels.

**Type generation pipeline:**
- [`frontend_common/src/generated-types.ts`](../../frontend_common/src/generated-types.ts) is auto-generated — do not edit by hand. It is gitignored.
- Generation is driven by [`web/scripts/generate-types.mjs`](../../web/scripts/generate-types.mjs), which calls the `openapi-typescript` programmatic API with a `transform` that converts `format: date-time` fields to `Date`. Run `npm run generate-types` with Django on port 8080.
- [`frontend_common/src/types.ts`](../../frontend_common/src/types.ts) derives domain types from `generated-types.ts` via intersection (no `Omit<>`). It also holds the `STATES` array and `SUCCESSORS` map from `workflow.yml`.
- **When adding a new API field:** update the Django serializer → run `npm run generate-types` → update `frontend_common/src/types.ts` if semantic narrowing is needed → update mappers in `frontend_common/src/api.ts`.
- [`frontend_common/src/api.ts`](../../frontend_common/src/api.ts) uses the `Wire<T>` generic to type raw Axios responses (dates as strings). Mappers convert `Wire<T>` → domain `T`. This is the only file that should contain deserialization logic.
- The OpenAPI schema is at `http://localhost:8080/api/schema/` and Swagger UI at `http://localhost:8080/api/schema/swagger/`.

**Thumbnails:**
- Curated SVG thumbnails live in [`web/public/thumbnails/`](../../web/public/thumbnails/).
- All thumbnails share a consistent earth-tone pottery style: fill `#c8956c`, stroke `#7a4f3a`, `viewBox="0 0 100 100"`. New thumbnails must follow this convention.
- `DEFAULT_THUMBNAIL` (exported from `NewPieceDialog.tsx`) points to `/thumbnails/question-mark.svg`.

**Existing components:**
- [`PieceList.tsx`](../../web/src/components/PieceList.tsx) — MUI table of `PieceSummary` objects (Thumbnail, Name, State, Created, Last Modified)
- [`NewPieceDialog.tsx`](../../web/src/components/NewPieceDialog.tsx) — dialog for creating a new piece; name, optional notes, thumbnail gallery
- [`WorkflowState.tsx`](../../web/src/components/WorkflowState.tsx) — edits the current `PieceState`: notes, location, additional fields, images (upload or URL), caption editing, lightbox launch
- [`CloudinaryImage.tsx`](../../web/src/components/CloudinaryImage.tsx) — renders a `CaptionedImage` via `@cloudinary/url-gen` + `@cloudinary/react` when available; falls back to a plain `<img>`. Sizing context: `thumbnail`/`preview` (64×64 fill), `lightbox` (90vw×80vh fit).
- [`ImageLightbox.tsx`](../../web/src/components/ImageLightbox.tsx) — full-screen modal image viewer with caption and keyboard/touch navigation

**Auth UI flow (`App.tsx`):**
- On load, calls `fetchCurrentUser()` (`GET /api/auth/me/`).
- Authenticated → routed app shell with current-user chip and logout action.
- Unauthenticated → login form with email/password and optional Google Sign-In button (`VITE_GOOGLE_CLIENT_ID`).
- `Sign Up` is intentionally disabled (`SIGN_UP_ENABLED = false`); create accounts via Django admin.

**Cloudinary image upload flow:**
- Images are stored as a JSON array of `CaptionedImage` objects (url, caption, created, cloudinary_public_id).
- `WorkflowState` calls `GET /api/uploads/cloudinary/widget-config/` → opens the Cloudinary Upload Widget → widget calls `POST /api/uploads/cloudinary/widget-signature/` for signing → on success stores `secure_url` + `public_id` locally → `PATCH /api/pieces/<id>/state/` persists the array.
- `CloudinaryImage` uses `cloudinary_public_id` (when present) for optimized delivery URLs; falls back to parsing the cloud name from the delivery URL for older images.
- Cloudinary is optional: if env vars are absent, the config endpoint returns 503 and the UI falls back to URL-paste mode.

**Google OAuth frontend:**
- Uses `@react-oauth/google` when `VITE_GOOGLE_CLIENT_ID` is configured.
- JWT credential is sent to `POST /api/auth/google/` for backend verification.

**Frontend testing — Glaze-specific guidance:**
- Every new or modified React component → add or update a test in `web/src/components/__tests__/`.
- Every new or modified `workflow.ts` helper → add or update a test in `frontend_common/src/workflow.test.ts`, mocking `workflow.yml` with a minimal fixture. Never import `workflow.yml` directly in a test — always mock it.
- Component tests that involve typing into a controlled MUI Autocomplete must use a stateful wrapper (see `Controlled` in `GlobalFieldPicker.test.tsx`).

---

## GitHub: Scope Limits & Definition of Done (Glaze-specific)

These extend the generic GitHub interactions guide with Glaze-specific protected files and DoD checks.

**Scope limits — ask before acting on any of these:**
- Modifying [`workflow.yml`](../../workflow.yml) (state definitions, transitions, successors)
- Modifying [`.github/workflows/`](../../.github/workflows/) (CI/CD configuration)
- Adding or removing Python dependencies (`requirements*.txt`)
- Adding or removing npm dependencies (`package.json`)
- Writing or altering database migrations
- Modifying deployment configuration, [`backend/settings.py`](../../backend/settings.py) or build settings [`build.sh`](../../build.sh)

**Additional definition-of-done checks:**
- Serializer output matches the TypeScript types in [`frontend_common/src/types.ts`](../../frontend_common/src/types.ts)
- State names and transitions are derived from [`workflow.yml`](../../workflow.yml), not hardcoded
- If `AGENTS.md` was modified, check whether [`README.md`](../../README.md) needs a corresponding update
- If conventions or constraints change during PR work, append those changes to the relevant file under `docs/agents/` in a follow-up commit

---

## Key Constraints

- `workflow.yml` is the single source of truth for states and transitions. Both backend validation and web UI must derive from it — never duplicate the state list.
- The `PieceState` history is append-only; past states should not be edited, only new ones added. Only the `current_state` should be modifiable. Once a piece transitions to a new state, past states are sealed — take care in backend code to prevent inadvertent edits to sealed states.
- `PieceDetail.current_state` is the most recent `PieceState` in the history.
- All dates should be stored and transmitted as ISO 8601 strings; the web types declare them as `Date` but Axios/JSON deserialization will deliver them as strings — handle accordingly.
- **Piece creation flow:** `POST /api/pieces/` always initializes the piece in the `designed` state. The creation UI (`NewPieceDialog`) lets the user supply a name, optional notes, and pick a thumbnail from the curated gallery.
- **Public library ownership:** Public global objects (`user=NULL`) are owned by no user and managed exclusively via Django admin. Regular API users can read public objects but cannot create, edit, or delete them. Use `is_public_global()` from `api/workflow.py` — do not hardcode this distinction.
