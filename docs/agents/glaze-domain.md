# Glaze — Domain Logic

## Branding

`PotterDoc` is the external product name. `glaze` remains the internal repository/project name for code identifiers, paths, and domain documentation during the rebrand unless a task explicitly calls for renaming internals too.

## Language

Use American English spelling throughout — in code, comments, documentation, and UI strings. For example: "behavior" not "behaviour", "initialize" not "initialise", "labeled" not "labelled", "analyze" not "analyse".

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

**What belongs in `workflow.yml` vs. what does not:** `workflow.yml` is for domain structure and business rules that both backend and frontend must agree on: state IDs, required state `friendly_name` labels, required state descriptions, transitions, field existence, requiredness, persistence shape, and domain constraints that affect validation or query behavior. It is not a home for presentation defaults, styling choices, or convenience UI metadata.

- **Belongs in `workflow.yml`:** lifecycle states, required `friendly_name` labels and descriptions for those states, successor relationships, whether a field/global exists at all, whether it is required, whether a global is public/private/favoritable/taggable, and true domain constraints where the allowed values are part of the business model.
- **Does not belong in `workflow.yml`:** default colors, color palettes, icon choices, display order chosen only for UX, component layout, and other presentation-layer defaults that the backend does not need in order to validate or persist the data.
- **Rule of thumb:** if changing the value should require a migration, backend validation change, API contract change, or data cleanup plan, it may belong in `workflow.yml`. If changing it should only affect how the UI looks or which default the user sees first, it belongs in frontend code instead.
- **Example:** a `Tag` having a persisted `color` field can be valid domain data if users explicitly choose and save a color. But a built-in palette of suggested colors, or a default initial color shown in the create form, is presentation logic and should live in the web layer, not in `workflow.yml`.
- **Capability pattern:** use `workflow.yml` to opt models into generic capabilities such as `favoritable: true` or `taggable: true`, not to encode one-off wiring details that generated backend/frontend code can infer.

Each global definition also carries several optional flags:
- `public` (default `false`): when `true`, this global type has an admin-managed shared library of public objects (stored with `user=NULL`) visible to all authenticated users. The corresponding Django model's `user` field must be nullable.
- `private` (default `true`): when `true`, users can create their own private instances of this type.
- `factory` (default `true`): when `false`, the Django model is hand-written and `_register_globals()` skips auto-generation for this global. Use only when bespoke model logic is required (currently only `piece`).
- `favoritable` (default `false`): when `true`, a `FavoriteModel` subclass is auto-generated for this global and the favorites API endpoints are enabled.
- `taggable` (default `false`): when `true`, instances of this global can be tagged using the shared `Tag` global. The developer interface should mirror favorites: a single `taggable: true` flag in `workflow.yml` opts the type into generated join-model support (for example `piece` → `TagEntry`) instead of bespoke per-type tagging code.

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

Each state in [`workflow.yml`](../../workflow.yml) must declare a `friendly_name` and a `description`. Clients use the authored label directly and do not derive a fallback from the snake_case state ID.

| State | Friendly name | Description |
|---|---|---|
| `designed` | `Designing` | Piece conceived/designed — universal entry point |
| `wheel_thrown` | `Throwing` | Piece created on the wheel |
| `handbuilt` | `Handbuilding` | Piece hand-sculpted |
| `trimmed` | `Trimming` | Wheel-thrown piece trimmed |
| `slip_applied` | `Adding Slip` | Decorative slip added |
| `carved` | `Carving` | Surface carved or decorated |
| `submitted_to_bisque_fire` | `Queued → Bisque` | Ready for initial firing |
| `bisque_fired` | `Planning → Glaze` | Initial bisque fire complete |
| `waxed` | `Waxing` | Wax resist applied before glazing |
| `glazed` | `Glazing` | Glaze applied |
| `submitted_to_glaze_fire` | `Queued → Glaze` | Ready for glaze firing |
| `glaze_fired` | `Touching Up` | Glaze fire complete |
| `sanded` | `Sanding` | Final sanding/finishing |
| `completed` | `Completed` | Terminal — finished piece |
| `recycled` | `Recycled` | Terminal — piece discarded or clay reclaimed |

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

**Project layout:**
- [`backend/`](../../backend/) — Django project settings, root URL config (`backend/urls.py`), WSGI/ASGI
- [`api/`](../../api/) — the single Django app; models, views, serializers, and tests all live here
- [`manage.py`](../../manage.py) — Django management entrypoint

All API endpoints are registered in `backend/urls.py`.

**Production environment variables** — `settings.py` gates dev/prod behavior on `IS_PRODUCTION = bool(os.environ.get('PRODUCTION', ''))`. The full env var reference:

| Setting | Env var | Dev behavior | Prod behavior |
|---|---|---|---|
| `SECRET_KEY` | `SECRET_KEY` | Falls back to an insecure hardcoded default | **Required** — raises `KeyError` if absent |
| `DEBUG` | *(derived from `PRODUCTION`)* | `True` | `False` |
| `DATABASES` | `DATABASE_URL` | SQLite at `db.sqlite3` | Postgres via `dj_database_url.config()` |
| `ALLOWED_HOSTS` | `ALLOWED_HOST` | `localhost`, `127.0.0.1` | Appends the single production hostname (e.g. `myapp.example.com`) |
| `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` | `APP_ORIGIN` | Localhost origins only | Appends the full origin URL (e.g. `https://myapp.example.com`) |
| `GOOGLE_OAUTH_CLIENT_ID` | `GOOGLE_OAUTH_CLIENT_ID` | Empty string — Google sign-in disabled | Set to enable Google OAuth JWT verification |
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | *(same names)* | Empty — widget-config returns 503 | Set to enable Cloudinary uploads |
| `CLOUDINARY_UPLOAD_FOLDER` | `CLOUDINARY_UPLOAD_FOLDER` | Not set | Optional subfolder for uploaded images |

**Model factory pattern** (`api/model_factories.py` → re-exported from `api/models.py`): global domain models are generated at import time from `workflow.yml` declarations — no hand-written model class is needed for new globals. Three factories handle every case:

- **`make_simple_global_model(global_name)`** — generates a `GlobalModel` subclass for any non-`compose_from` global. Fields, the `user` FK, and `UniqueConstraint`s are derived entirely from the `workflow.yml` declaration. Only a `makemigrations` run is required to add a new simple global.
- **`make_compose_global_models(global_name)`** — generates a `(CompositeModel, ThroughModel)` pair for a `compose_from` global. The composite receives an ordered M2M field, a stored computed `name`, inline and FK DSL fields, `compute_name()`, `get_or_create_with_components()`, `get_or_create_from_ordered_pks()`, `filterable_fields`, and a `post_fixture_load` hook — all derived from the DSL. Only a `makemigrations` run is required.
- **`make_favorite_model(global_name)`** — generates a `FavoriteModel` subclass for any `favoritable: true` global. Only a `makemigrations` run is required.

`api/models.py` calls `_register_globals()` at import time, which iterates `workflow.yml` globals and injects the generated classes into the module namespace so they are importable as `api.models.Location`, `api.models.GlazeCombination`, etc. and Django migrations treat them identically to hand-written classes.

`factory: false` opts a global out of auto-generation; use it for globals whose Django model is hand-written (currently only `piece`).

**`GlobalModel` abstract base class** (`api/model_factories.py`): all global domain models inherit from it.
- Enforces user immutability: the `user` FK cannot change after creation (prevents silent breakage of public/private reference invariants).
- Declares the `name` field convention: every concrete subclass must have a `name` CharField (or a stored computed equivalent). For `compose_from` globals the `name` is a stored computed string (component names joined by `COMPOSITE_NAME_SEPARATOR` (`!`)). Simple-global `name` validation rejects the separator to keep component names embeddable.
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
- `GET /api/globals/<global_name>/` → for private-only globals returns only the user's private objects; for public globals returns the user's private objects union all public objects (`user=NULL`), sorted by display field. Each item includes `is_public: bool`. **`global_entries` is the canonical list endpoint for all global types — do not add a separate `/api/<global-name>/` list route.**
  - Models may opt in to richer GET responses by declaring a `filter_queryset(qs, request)` classmethod (for query-param filtering) and registering a serializer in `_GLOBAL_ENTRY_SERIALIZERS` in `api/views.py`. `GlazeCombination` uses both: it supports `?glaze_type_ids=`, `?is_food_safe=`, `?runs=`, `?highlights_grooves=`, `?is_different_on_white_and_brown_clay=` query params and returns additional fields (`test_tile_image`, filter booleans, `glaze_types` list, `is_favorite`).
- `POST /api/globals/<global_name>/` → get-or-create a private record owned by the requesting user. For public globals, a private entry with the same name as a public entry is permitted — the two scopes are independent.
- `POST /api/globals/<global_name>/<pk>/favorite/` → add the entry to the requesting user's favorites (currently only `glaze_combination` supports favorites; other types return 405).
- `DELETE /api/globals/<global_name>/<pk>/favorite/` → remove the entry from the requesting user's favorites.
- `GET /api/uploads/cloudinary/widget-config/` → returns `{cloud_name, api_key, folder?}`; 503 if Cloudinary not configured
- `POST /api/uploads/cloudinary/widget-signature/` → accepts `{params_to_sign: {}}`, returns `{signature}`

**Google OAuth backend:**
- Verifies JWT with Google's servers using `google-auth` library (`GOOGLE_OAUTH_CLIENT_ID` env var).
- Looks up existing user by `UserProfile.openid_subject`; falls back to email matching for migration from email/password accounts; creates new Google-only account if no match found.
- Updates user profile (name, picture) from Google on each login and creates a Django session.

**Backend testing — Glaze-specific guidance:**
- The `piece` fixture in `api/tests/conftest.py` creates a piece via the ORM directly; prefer the API client (`client.post(...)`) for tests that exercise request/response behavior.
- Every new API endpoint or serializer change → add or update a test under `api/tests/`.
- Every new or modified `api/workflow.py` helper → add or update a test in `api/tests/test_workflow_helpers.py`, patching `_STATE_MAP` / `_GLOBALS_MAP` via `monkeypatch`.
- **New global domain models**: adding a new entry to `workflow.yml` and running `makemigrations` is sufficient — `_register_globals()` auto-generates and registers the model at import time. The generated class is automatically enrolled in the parameterised test suites in `api/tests/test_globals.py`. No manual model or test additions are needed for registry invariants — focus new tests on model-specific constraints and API behavior instead. Set `factory: false` only if the global needs a hand-written model class with bespoke logic.

---

## Frontend Conventions (Glaze-specific)

These supplement the generic TypeScript/React/Vite conventions.

**Shared module alias:** Import shared types, API helpers, and workflow utilities using the `@common` path alias (`@common/types`, `@common/api`, `@common/workflow`) — never use relative `../../../frontend_common/src/...` paths. The alias resolves to `frontend_common/src/` and is configured in each app's tsconfig `paths` and bundler config. Note: This shared module cannot take direct dependencies on React, since React is only imported from `../../web/src/...`.

**State names and transitions:** Come from `workflow.yml` via the constants in `@common/types` (`STATES`, `SUCCESSORS`) — do not hardcode them in components.

**HTTP calls:** All go through [`frontend_common/src/api.ts`](../../frontend_common/src/api.ts) (imported as `@common/api`). This is the single place where wire types (ISO date strings, etc.) are mapped to domain types. Components must never perform their own serialization or deserialization.

**Data-fetching pattern (`useAsync`):** Any component that loads data from the API on mount or when a dependency changes must use the `useAsync` hook from `../../web/src/util/useAsync`. Do not inline `useState` + `useEffect` + `.catch` + `.finally` for loading/error/data state management — use `useAsync` instead. It handles the cancellation flag, error normalization, and exposes `setData` for optimistic local mutations.

```tsx
// ✅ correct
const { data: pieces, loading, error, setData: setPieces } = useAsync<PieceSummary[]>(fetchPieces)
// On new piece created locally:
setPieces(prev => [newPiece, ...(prev ?? [])])

// ❌ incorrect — do not inline this pattern
const [data, setData] = useState(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
useEffect(() => {
  fetchSomething()
    .then(setData)
    .catch(() => setError('Failed'))
    .finally(() => setLoading(false))
}, [])
```

All data-fetching components must render a loading spinner (`<CircularProgress />`) while `loading` is true and an error message when `error` is non-null. Silent `.catch(() => {})` is only acceptable for best-effort background operations where failure is genuinely invisible to the user.

**Shared UI extraction:** Treat route-level and detail/list container components such as `PieceDetail.tsx` and `PieceList.tsx` as orchestration layers, not homes for duplicated presentational subtrees. When a feature introduces the same UI concept in multiple places, extract a reusable component in `web/src/components/` rather than keeping separate inline implementations in each parent. If a new feature adds more than a small self-contained JSX block to one of these containers, prefer a named child component with typed props.

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
- [`StateChip.tsx`](../../web/src/components/StateChip.tsx) — shared workflow-state token. Takes `variant: 'current' | 'past' | 'future'` plus `isTerminal` and optional interaction hooks so list/detail/timeline UIs stay in one visual family.

**Visual design system — state chips and state flow:**
- Treat workflow-state tokens as a dedicated UI language, not as interchangeable tag chips or generic MUI buttons. Tags represent user-authored metadata; state chips represent the pottery workflow itself and should stay visually distinct.
- Keep state-chip color rules in frontend code, not in [`workflow.yml`](../../workflow.yml). The workflow file defines which states exist and which successors are valid; the web layer owns presentation decisions such as chip color, dot treatment, connector lines, hover fills, and emphasis.
- The current state in [`PieceDetail.tsx`](../../web/src/components/PieceDetail.tsx) should read as the anchor of the flow: solid outline, lightly filled background, and a filled status dot on the left. It may be slightly larger than successor chips, but it should still feel related to them.
- Valid successor states should render as actionable state chips, not CTA-style buttons. They should size to their content, use dotted or dashed outlines plus outlined dots by default, and become visually "promoted" on hover by filling the background, solidifying the outline, and filling the dot.
- Hovering a valid successor should also temporarily de-emphasize the current state with a muted gray treatment. This creates a preview of "if you clicked this, the hovered successor would become the new current state."
- Use semantic state colors consistently across the app. Current conventions in `PieceDetail` are:
- `completed` → green
- `recycled` → red
- all other active workflow states → the shared warm clay accent (`oklch(0.66 0.17 35)`)
- When the UI needs to show a branch from one current state to multiple valid successors, use an explicit connector treatment rather than text labels like "Current" or "Next". [`PieceDetail.tsx`](../../web/src/components/PieceDetail.tsx) currently uses a small SVG branch connector between the current-state chip and the vertical list of successors.
- Past states are sealed historical records, not available actions. When rendered as chips in future history or timeline views, they should stay in the same visual family as state chips but with clearly reduced emphasis: read-only, no hover preview, no interactive affordance, and a lower-contrast or muted treatment that distinguishes them from both the current state and valid successors.
- Do not restyle state chips to match tags, favorites, filter pills, or upload buttons for convenience. If a new screen needs workflow states, prefer extracting or extending a shared state-chip component rather than recreating an ad hoc variant.
- If the state-flow styling changes in a meaningful way, update this section alongside the implementation so future agents do not reintroduce tag-like current states or button-like successor states by accident.

**State-flow screenshots:**
- There are currently no repo-hosted screenshots for this pattern.
- When adding them, store them under a stable docs path such as `docs/images/state-flow/` and link them here with ordinary Markdown image links so the screenshots travel with the repository history.
- Suggested captures:
- `PieceDetail` showing one current state with multiple valid successors
- `PieceDetail` showing a hovered valid successor and the muted current-state preview
- a history or timeline view once past-state chips exist as a first-class pattern

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

## Glaze Import Tool (Admin)

Staff users have access to a browser-based bulk import workflow at `/tools/glaze-import`. It is the canonical way to seed the public `GlazeType` and `GlazeCombination` libraries from physical test-tile photographs. The tool is a five-to-six step tabbed flow:

| Tab | Purpose |
|-----|---------|
| **1. Upload** | Bulk-upload source images from disk (JPEG/PNG) or via the Cloudinary widget (HEIC/HEIF conversion). Each image becomes an independent record. |
| **2. Crop** | Draw a rotatable square crop box over each image. The box may extend beyond the image bounds; overflow becomes transparent in the output. Crop geometry is debounced so the live preview updates only after 200 ms of inactivity. |
| **3. OCR** | Optionally draw a rotatable OCR region bounding box on the crop preview. Running OCR on all records at once feeds Tesseract.js with a domain word list (runs, caution, food safe, 1st, 2nd, glaze) and then parses the result with two heuristics applied in order: (1) structured-line detection (`/[I1]st Glaze[:;]/` → `first_glaze`, `/[2=Z]nd Glaze[:;]/` → `second_glaze`) and (2) a token-split fallback that looks for common combo separators (`!`, `/`, `&`, `+`, `over`). CAUTION RUNS detection sets `runs: true`; NOT FOOD SAFE detection sets `is_food_safe: false`. |
| **4. Review** | Per-record editable form: name, kind (`glaze_type` / `glaze_combination`), first/second glaze fields (hidden for types), `runs?`, and `food safe?` selects. For combinations, the name field is auto-computed as `<first>!<second>` and is read-only. Records must be checked as reviewed before import. |
| **5. Import** | Sends all reviewed records and their compressed crop images (WebP ≤ 2000 px, 0.85 quality) to `POST /api/admin/manual-square-crop-import/`. A per-record progress list shows Build → Upload → Done for each file. Import results include admin links to every created or matched object. |
| **6. Reconcile** *(conditional)* | Appears only when the import skipped duplicates. Shows the scraped fields for each skipped record alongside an "Open in Admin" link to the existing record, and a resolved checkbox checklist. |

### Backend import endpoint

`POST /api/admin/manual-square-crop-import/` — staff only (`is_staff`). Accepts a `multipart/form-data` body:
- `payload` — JSON string `{ records: ManualSquareCropImportRecordPayload[] }` (see `frontend_common/src/api.ts` for the shape).
- `crop_image__<client_id>` — one WebP file per record.

The endpoint is implemented in `api/manual_tile_imports.py`. For each `glaze_type` record it creates a public `GlazeType` (and a matching single-layer `GlazeCombination`) and uploads the crop to Cloudinary. For each `glaze_combination` record it resolves the two referenced public `GlazeType` rows by name, creates a public `GlazeCombination`, and sets the ordered layers. **`runs` and `is_food_safe` from `parsed_fields` are written to both `GlazeType` and `GlazeCombination` on creation.** Existing public records with the same name are reported as `skipped_duplicate` (not updated).

### OCR parsing conventions

- Structured lines take priority: a line matching `/^[I1l]st\s+[Gg]laze\s*[:;]\s*(.+)/` is the first glaze; `/^[2=Z]nd\s+[Gg]laze\s*[:;]/` is the second. The character classes handle common OCR confusions (`I`/`1`/`l` for `1`, `=`/`Z` for `2`, `;` for `:`).
- If no structured lines are found, the longest non-annotation line is used. Tokens split on `!`, `/`, `&`, `+`, `over` determine whether the result is a combination (≥ 2 tokens) or a single type.
- Annotation lines matching `CAUTION.*RUNS` or `NOT FOOD SAFE` are stripped from the name and used to set `runs`/`is_food_safe` in `parsed_fields`.

### Protected files for this feature

`api/manual_tile_imports.py` and `web/src/pages/AdminManualSquareCropToolPage.tsx` are the two primary implementation files. `api/tests/test_manual_square_crop_import.py` must be kept in sync with any import-logic changes.

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
- Run `./build.sh` locally and confirm it succeeds before opening a PR or pushing follow-up commits to an existing one.
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
