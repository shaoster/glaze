---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: glaze-backend
description: |
  Glaze-specific backend conventions: model factory pattern, GlobalModel, globals
  visibility tiers, API endpoints, image FK normalization, R2 uploads and crops,
  Django admin customizations, Google OAuth backend, Glaze Import Tool, and
  debugging prod-only backend bugs (data state gaps, Django shell data manipulation,
  management commands for reproducing specific conditions).
  Invoke for any backend work touching Glaze domain models, API endpoints, admin,
  or when a backend bug only reproduces with specific prod data shapes.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Glaze Backend Conventions

## Project Layout

- `backend/` — Django project settings, root URL config (`backend/urls.py`), WSGI/ASGI
- `api/` — single Django app; models, serializers, tests, and feature subpackages
- `manage.py` — Django management entrypoint

All API endpoints are registered in `backend/urls.py`.

## ASGI Server

Production runs gunicorn with `uvicorn.workers.UvicornWorker`. Write a view as
`async def` only when it performs long-running or streaming I/O that would block the
worker heartbeat (e.g. the account data export endpoint). Wrap sync ORM/SDK calls inside
async views with `asyncio.to_thread(...)`. Use `httpx.AsyncClient` for outbound HTTP
inside async views.

## Module Boundaries

- `api/workflow.py` — strictly for helpers that read from `workflow.yml`: state lookups,
  successor queries, globals-map queries, field-definition resolution, JSON Schema generation
- `api/preferences.py` — dynamically generates serializers from `user_preferences.yml` and `tutorials.yml`.
- `api/utils.py` — shared business-logic helpers that span modules but have nothing to
  do with the state machine (e.g. `sync_glaze_type_singleton_combination`)
- Feature-specific endpoint logic should live under concern packages such as
  `api/auth/`, `api/piece/`, `api/global_entries/`, `api/uploads/`, and
  `api/dev/`. Keep top-level `api/*.py` modules as thin compatibility wrappers
  when needed for stable imports, tests, or URL registration. When a feature
  package exposes reusable logic, the public functions in that package are the
  supported contract: document them, trace them, and test them directly.

## Declarative User Preferences and Tutorials

Glaze uses `user_preferences.yml` and `tutorials.yml` to drive backend validation and persistence.

- **`api/preferences.py`**: Loads both YAMLs at module import.
- **`SavedUserPreferencesSerializer`**: Injects fields defined in `user_preferences.yml` (storage: `UserProfile.preferences`) and all tutorials from `tutorials.yml` as booleans.
- **`UserPreferencesSerializer`**: Top-level serializer for the `/api/auth/me/` and `/api/auth/preferences/` endpoints.
- New preferences or tutorials should be added to the YAML files, not hardcoded in serializers.

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
`ImageForwardDescriptor` intercepts every assignment and calls `normalize_image_payload`:
- **String value** (plain URL): creates or retrieves an `Image` row keyed by URL; the
  R2 object key (`r2_key`) is derived server-side from the URL, never trusted from the
  client.
- **Dict value** `{"url": ..., "width"?: ..., "height"?: ...}`: same URL-keyed dedup,
  additionally recording pixel dimensions. Format produced by the upload flow.

**Fixture format:** `fixtures/public_library.json` stores `type: image` fields as
`{"url": ...}` dicts; `loaddata` normalizes them into `Image` rows.

**Image metadata contract:** `Image.url` always holds the public delivery URL;
`Image.r2_key` is populated only for URLs under the configured `R2_PUBLIC_URL` domain.
Foreign URLs (curated local SVG thumbnails in `web/public/thumbnails/`, legacy external
assets) get `r2_key=None` — they render fine but cannot participate in the eager crop
pipeline.

## R2 Storage and Eager Crop Pipeline

- `api/r2.py` — Cloudflare R2 (S3-compatible) helpers: presigned PUT URLs, public URL ↔
  key mapping, byte/file uploads. Configuration is read from `os.environ` at call time;
  `is_r2_configured()` requires all five `R2_*` vars.
- Crops are **eager**: crop coordinates live on `PieceStateImage.crop`; saving them
  enqueues the async `generate_cropped_image` task (`api/crops.py`, `api/tasks.py`),
  which renders a JPEG derivative with Pillow (`exif_transpose`, pixel crop, long edge
  ≤1600px, quality 82) to the deterministic key `crops/{r2_key}/{x}-{y}-{w}-{h}.jpg`
  and sets `cropped_r2_key`/`cropped_url` on **all** PSI rows matching `(image, crop)`.
  No request-time transforms exist anywhere.
- `python manage.py migrate_assets_to_r2 [--dry-run] [--limit N]` — two idempotent
  passes: re-host legacy externally hosted originals in R2, then backfill missing crop
  derivatives.

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
- `POST /api/uploads/r2/presigned-url/` → accepts `{content_type, resource_type?}`; returns `{upload_url, key, public_url, expires_in}`; key is fully server-generated (`images/{user.id}/{uuid}.{ext}`); `video`/`audio` resource types are staff-only; 503 if R2 not configured

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
- **`R2ImageWidget`** — `TextInput` subclass with thumbnail preview and "Upload Image"
  button (URL-paste only when R2 is unconfigured). Canonical value is a bare URL string;
  `normalize_image_payload` derives `r2_key` server-side. `Media` class loads
  `api/static/admin/js/r2_image_widget.js`, which requests a presigned PUT URL from
  `/api/uploads/r2/presigned-url/` and uploads the file straight to R2.
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
| R2 object storage | `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` | Empty — `/api/uploads/r2/presigned-url/` returns 503 | All five required together; read from `os.environ` at call time in `api/r2.py` (no `settings.py` entries). Also gates showcase video generation |

## Glaze Import Tool Backend

`POST /api/admin/manual-square-crop-import/` — staff only (`is_staff`). Accepts
`multipart/form-data`:
- `payload` — JSON string `{ records: ManualSquareCropImportRecordPayload[] }`
- `crop_image__<client_id>` — one WebP file per record

Implemented in `api/manual_tile_imports.py`. For `glaze_type` records: creates public
`GlazeType` (and matching single-layer `GlazeCombination`), uploads crop to R2.
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

## Debugging Prod-Only Backend Bugs

The most common reason a backend bug only reproduces in prod is a **data state gap**:
dev seeding always populates a field that prod sometimes leaves null, or dev always
creates rows in a particular order that prod doesn't guarantee.

**1. Find the data condition that differs.**

Ask the developer what the failing request looks like in prod — the API response,
the relevant model fields, or the Django admin view. A single `null` where dev always
has a value is usually enough to narrow it down.

**2. Manufacture the specific data state in the dev database.**

Use the Django shell to patch the database directly rather than trying to reproduce
the condition through the normal UI flow:

```bash
# Target the worktree database explicitly (see note below about bazel run //:manage)
DATABASE_URL=sqlite:////home/phil/code/glaze/.agent-worktrees/claude/issue-<N>-<slug>/db.sqlite3 \
  .manage.venv/bin/python manage.py shell -c "
from api.models import Piece
# e.g. clear thumbnail_crop on the first page to match prod's null condition
pieces = list(Piece.objects.order_by('-fields_last_modified')[:24])
for i, p in enumerate(pieces):
    p.thumbnail_crop = None if i % 2 == 0 else p.thumbnail_crop
    p.save(update_fields=['thumbnail_crop'])
print('done')
"
```

For complex or repeatable setups, write a management command under
`api/management/commands/` so the operation is self-documenting and can be re-run.

**3. Confirm the bug reproduces before writing any fix.**

Hit the endpoint with `curl` or the Django test client against the patched data and
confirm the error reproduces. Do not write the fix until you can demonstrate the failure.

**⚠️ `bazel run //:manage` uses the main checkout's database, not the worktree's.**

`bazel run //:manage` resolves `BASE_DIR` from the Bazel execroot, which points at
the main checkout regardless of which worktree you're in. Any migration or shell
command run this way silently hits the wrong database.

Always use the worktree's `.manage.venv` directly with an explicit `DATABASE_URL`:

```bash
# ❌ uses main checkout db regardless of which worktree you're in
bazel run //:manage -- shell

# ✅ uses worktree db
DATABASE_URL=sqlite:////absolute/path/to/worktree/db.sqlite3 \
  .manage.venv/bin/python manage.py shell
```
