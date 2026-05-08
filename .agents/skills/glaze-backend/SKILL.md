---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: glaze-backend
description: |
  Glaze-specific backend conventions: model factory pattern, GlobalModel, globals
  visibility tiers, API endpoints, image FK normalization, Cloudinary cleanup,
  Django admin customizations, Google OAuth backend, and Glaze Import Tool.
  Invoke for any backend work touching Glaze domain models, API endpoints, or admin.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Glaze Backend Conventions

## Project Layout

- `backend/` — Django project settings, root URL config (`backend/urls.py`), WSGI/ASGI
- `api/` — single Django app; models, views, serializers, tests
- `manage.py` — Django management entrypoint

All API endpoints are registered in `backend/urls.py`.

## ASGI Server

Production runs gunicorn with `uvicorn.workers.UvicornWorker`. Write a view as
`async def` only when it performs long-running or streaming I/O that would block the
worker heartbeat (e.g. the Cloudinary archive endpoint). Wrap sync ORM/SDK calls inside
async views with `asyncio.to_thread(...)`. Use `httpx.AsyncClient` for outbound HTTP
inside async views.

## Module Boundaries

- `api/workflow.py` — strictly for helpers that read from `workflow.yml`: state lookups,
  successor queries, globals-map queries, field-definition resolution, JSON Schema generation
- `api/utils.py` — shared business-logic helpers that span modules but have nothing to
  do with the state machine (e.g. `sync_glaze_type_singleton_combination`)

## Model Factory Pattern (`api/model_factories.py`)

Global domain models are generated at import time from `workflow.yml` — no hand-written
model class needed for new globals.

- **`make_simple_global_model(global_name)`** — generates a `GlobalModel` subclass for
  any non-`compose_from` global. Fields, `user` FK, and `UniqueConstraint`s derived from
  `workflow.yml`. Only `makemigrations` needed to add a new simple global.
- **`make_compose_global_models(global_name)`** — generates `(CompositeModel, ThroughModel)`
  pair. Composite gets ordered M2M, stored computed `name`, `compute_name()`,
  `get_or_create_with_components()`, `filterable_fields`, `post_fixture_load` — all from DSL.
- **`make_favorite_model(global_name)`** — generates `FavoriteModel` subclass for
  `favoritable: true` globals.

`api/models.py` calls `_register_globals()` at import time, injecting generated classes
into the module namespace. `factory: false` opts a global out of auto-generation.

## `GlobalModel` Abstract Base Class

All global domain models inherit from it:
- Enforces user immutability (FK cannot change after creation)
- Declares `name` field convention (every concrete subclass must have `name`)
- For `compose_from` globals: `name` is a stored computed string (components joined by `!`)
- Maintains `GlobalModel._registry` for parameterised tests

## Globals Visibility Tiers

- **Private-only** (`Location`, `GlazeMethod`): `user` FK is NOT NULL; list endpoints
  filter to `request.user` only
- **Public + private** (`ClayBody`, `GlazeType`, `GlazeCombination`): list endpoints
  return user's private objects + all public (user=NULL) objects; includes `is_public`
  boolean. POST always creates a private record for the requesting user.

Name uniqueness enforced by two conditional DB constraints (one for private, one for public).
Private and public scopes are independent.

## Image FK Normalization (`ImageForeignKey` / `ImageForwardDescriptor`)

`type: image` fields on global models are stored as FKs to `api.Image`, not raw JSON.
`ImageForwardDescriptor` intercepts every assignment:
- **String value** (plain URL): creates `Image` row with `cloud_name=None`,
  `cloudinary_public_id=None`. **Breaks image metadata contract** — do not use for
  Cloudinary images.
- **Dict value** `{"url": ..., "cloud_name": ..., "cloudinary_public_id": ...}`: creates
  `Image` row keyed by `(cloud_name, cloudinary_public_id)`. **Correct format.**

**Fixture format:** `fixtures/public_library.json` must store `type: image` fields as
dicts, not plain URLs. Reverting to URL strings silently breaks the metadata contract.

**Image metadata contract:** Every Cloudinary-backed image record is guaranteed to have
both `cloudinary_public_id` and `cloud_name` populated. Code may always assume the
Cloudinary SDK path is available. Only exceptions: curated local SVG thumbnails in
`web/public/thumbnails/` — these have no Cloudinary identity.

## API Endpoints

- `GET /api/auth/csrf/` → set CSRF cookie
- `POST /api/auth/login/` → session login via email + password
- `POST /api/auth/logout/` → clear current session
- `GET /api/auth/me/` → current authenticated user
- `POST /api/auth/register/` → register + login
- `POST /api/auth/google/` → Google OAuth 2.0 login via JWT credential
- `GET /api/pieces/` → list of `PieceSummary`
- `GET /api/pieces/<id>/` → `PieceDetail`
- `GET /api/pieces/<id>/current_state/` → current editable `PieceState` only
- `POST /api/pieces/` → create piece (always starts in `designed`; accepts `name`, optional `thumbnail`, optional `notes`)
- `POST /api/pieces/<id>/states/` → record a new state transition
- `PATCH /api/pieces/<id>/` → update piece-level editable fields (currently location)
- `PATCH /api/pieces/<id>/state/` → update current state's editable fields
- `GET /api/globals/<global_name>/` → list endpoint for all global types (canonical — do not add separate routes)
- `POST /api/globals/<global_name>/` → get-or-create private record for requesting user
- `POST /api/globals/<global_name>/<pk>/favorite/` → add to favorites
- `DELETE /api/globals/<global_name>/<pk>/favorite/` → remove from favorites
- `GET /api/uploads/cloudinary/widget-config/` → returns `{cloud_name, api_key, folder?}`; 503 if not configured
- `POST /api/uploads/cloudinary/widget-signature/` → accepts `{params_to_sign: {}}`, returns `{signature}`

**`global_entries` is canonical for all global list/create.** Do not add separate
`/api/<global-name>/` routes. Models may opt into richer GET responses via
`filter_queryset(qs, request)` classmethod and a serializer in `_GLOBAL_ENTRY_SERIALIZERS`.

**Piece vs. current-state access:**
- Use `GET /api/pieces/<id>/` when screen needs the whole aggregate
- Use `GET /api/pieces/<id>/current_state/` when a child editor only needs the current editable slice
- Do not introduce `GET /api/piece-states/<state_id>/` as a primary pattern — past states are sealed

**History is append-only.** Only `current_state` is modifiable. Once transitioned, past states are sealed — prevent inadvertent edits in backend code.

**Piece creation:** `POST /api/pieces/` always initializes in `designed` state.

## Django Admin (`api/admin.py`)

- **`GlazeAdminSite`** — subclass overriding `get_app_list` to move public library models
  into a separate "Public Libraries" section. Applied via `admin.site.__class__ = GlazeAdminSite`.
- **`PublicLibraryAdmin`** — base `ModelAdmin` for `public: true` globals. Filters to
  public objects only (`user__isnull=True`); forces `obj.user = None` on save; rejects
  names colliding with existing private objects.
- **`CloudinaryImageWidget`** — `TextInput` subclass with thumbnail preview and "Upload Image"
  button. `Media` class loads Cloudinary CDN script + `api/static/admin/js/cloudinary_image_widget.js`.
- **Dynamic registration** — `PublicLibraryAdmin` registered for every `get_public_global_models()`.
  Adding `public: true` to a global in `workflow.yml` is sufficient.

## Google OAuth Backend

- Verifies JWT with Google using `google-auth` library (`GOOGLE_OAUTH_CLIENT_ID` env var)
- Looks up by `UserProfile.openid_subject`; falls back to email for migration; creates new account if no match
- Updates user profile (name, picture) on each login

## Production Environment Variables

| Setting | Env var | Dev behavior | Prod behavior |
|---|---|---|---|
| `SECRET_KEY` | `SECRET_KEY` | Falls back to insecure hardcoded default | **Required** — raises `KeyError` if absent |
| `DEBUG` | _(derived)_ | `True` | `False` |
| `DATABASES` | `DATABASE_URL` | SQLite at `db.sqlite3` | Postgres via `dj_database_url.config()` |
| `ALLOWED_HOSTS` | `ALLOWED_HOST` | `localhost`, `127.0.0.1` | Appends production hostname |
| `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` | `APP_ORIGIN` | Localhost origins only | Appends full origin URL |
| `GOOGLE_OAUTH_CLIENT_ID` | `GOOGLE_OAUTH_CLIENT_ID` | Empty — Google sign-in disabled | Set to enable |
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | _(same names)_ | Empty — widget-config returns 503 | Set to enable uploads |
| `CLOUDINARY_UPLOAD_FOLDER` | `CLOUDINARY_UPLOAD_FOLDER` | Not set | Optional subfolder for uploads |

## Glaze Import Tool Backend

`POST /api/admin/manual-square-crop-import/` — staff only (`is_staff`). Accepts
`multipart/form-data`:
- `payload` — JSON string `{ records: ManualSquareCropImportRecordPayload[] }`
- `crop_image__<client_id>` — one WebP file per record

Implemented in `api/manual_tile_imports.py`. For `glaze_type` records: creates public
`GlazeType` (and matching single-layer `GlazeCombination`), uploads crop to Cloudinary.
For `glaze_combination` records: resolves two public `GlazeType` rows by name, creates
public `GlazeCombination`, sets ordered layers. `runs` and `is_food_safe` from
`parsed_fields` are written to both on creation. Existing public records with same name
are reported as `skipped_duplicate`.

Keep `api/manual_tile_imports.py` and `api/tests/test_manual_square_crop_import.py` in sync.

## Backend Testing Guidance

- Every new API endpoint or serializer change → add/update test under `api/tests/`
- Every new/modified `api/workflow.py` helper → add/update test in `api/tests/test_workflow_helpers.py`, patching `_STATE_MAP` / `_GLOBALS_MAP` via `monkeypatch`
- New global domain models: `_register_globals()` auto-generates the model at import time; auto-enrolled in parameterised tests in `api/tests/test_globals.py` — focus new tests on model-specific constraints and API behavior
- Prefer the API client (`client.post(...)`) for request/response tests over direct ORM
- Add to existing test files that cover the same module — do not create new cross-cutting files
