# Glaze Backend API

This directory contains the Django backend for PotterDoc.

## Authentication and Data Isolation

PotterDoc now runs as a user-scoped application with session authentication.

- Auth is session/cookie-based (Django + DRF `SessionAuthentication`).
- The web client fetches a CSRF cookie from `GET /api/auth/csrf/` before login/logout/register writes.
- Auth endpoints:
  - `POST /api/auth/login/` (email + password)
  - `POST /api/auth/logout/`
  - `GET /api/auth/me/`
  - `POST /api/auth/register/` (backend supported; see UI note below)
  - `POST /api/auth/google/` (Google OAuth 2.0)
- Workflow/data endpoints (`/api/pieces/*`, `/api/globals/*`) require authentication.

### Google OAuth Flow

PotterDoc supports Google Sign-In using OAuth 2.0 with OpenID Connect. The flow works as follows:

1. **Frontend**: The web app uses `@react-oauth/google` to display a Google Sign-In button when `GOOGLE_OAUTH_CLIENT_ID` is configured.
2. **Google Authentication**: User clicks the button, Google handles authentication and returns a JWT credential.
3. **Backend Verification**: The frontend sends the JWT to `POST /api/auth/google/`, where Django verifies the token with Google's servers using `google-auth`.
4. **User Creation/Login**:
   - If the Google subject ID exists in `UserProfile.openid_subject`, the existing user is logged in.
   - If not, the system looks for an existing user with the same email address (graceful migration from email/password accounts).
   - If no user exists, a new account is created with an unusable password (Google-only account).
5. **Profile Sync**: User profile information (name, picture) is updated from Google on each login.

**Environment Variables Required:**

- `GOOGLE_OAUTH_CLIENT_ID`: Your Google OAuth client ID from Google Cloud Console

Per-user data isolation rules:

- Every user-owned domain object (`Piece`, `PieceState`, `Location`, `ClayBody`, `GlazeType`, `GlazeMethod`) has a `user` foreign key.
- List endpoints only return objects for `request.user`.
- Detail/update endpoints fetch objects from a user-filtered queryset. If another user's ID is requested, the API returns `404` (not `403`) to avoid leaking object existence.
- Global reference entries are user-scoped; names are unique per user (for example, two users can both have a `Location` named "Kiln A" without colliding).

## Package Layout

Endpoint logic now lives in feature subpackages so each concern can keep its own helpers, tests, and compatibility shims:

- `api/auth/` — auth/login/logout/export/account helpers
- `api/piece/` — piece list/detail/state/image helpers
- `api/global_entries/` — shared globals list/create/favorite logic
- `api/cloudinary/` — widget config and admin cleanup endpoints
- `api/dev/` — local bootstrap helpers

Top-level `api/*.py` modules remain thin compatibility wrappers for stable URL registrations and older imports. When a helper module exposes reusable logic, its public functions should be documented, tested directly, and traced so the module boundary stays observable.

The backend also exposes `POST /api/telemetry/traces/`, which accepts browser
OTLP/HTTP trace batches and proxies them to the local collector. The frontend
uses this path for same-origin trace export so the browser never needs direct
Grafana credentials.

## Declarative Configuration

Glaze uses YAML-driven configuration to minimize boilerplate and ensure consistency between backend validation and frontend UI.

### User Preferences (`user_preferences.yml`)

Drives the `UserPreferencesSerializer` and the frontend settings dialog.
- Defines sections, fields, types (`string`, `boolean`, `field-list`), and storage locations (`UserProfile` or `UserProfile.preferences`).
- Backend logic in `api/preferences.py` generates serializers dynamically at module load.
- See the [Frontend Client (`web/`)](../web/README.md) for UI implementation details.

### Tutorials (`tutorials.yml`)

Drives small, dismissible tutorial tips.
- Defines preference keys, inlay labels, and declarative DOM attachment rules (CSS selectors).
- Automatically injected into user preferences for persistence.
- Frontend `TutorialManager` handles dynamic attachment without manual JSX.

## Testing

The API Bazel test targets in [`api/BUILD.bazel`](./BUILD.bazel) set
`DJANGO_SETTINGS_MODULE=backend.test_settings` through the shared `_TEST_ENV`
for the default test harness. That keeps the suite on the self-contained test
settings module instead of importing `backend.settings` for every run.

This buys us two things: smaller test dependencies, and better Bazel cache
behavior because the default suite no longer inherits production-only settings
branches that can change unrelated test outcomes. In practice, that means the
API tests start faster, stay easier to reason about, and only depend on the
settings surface the tests actually need.

## Django management

| Command                   | Description                     |
| ------------------------- | ------------------------------- |
| `gz_manage <cmd> [args…]` | Run any `manage.py` subcommand. |
| `gz_migrate`              | `manage.py migrate`             |
| `gz_makemigrations`       | `manage.py makemigrations`      |
| `gz_shell`                | Django interactive shell        |
| `gz_dbshell`              | Raw database shell (SQLite)     |
| `gz_showmigrations`       | `manage.py showmigrations`      |
| `gz_dump_public_library`  | `manage.py dump_public_library` |
| `gz_load_public_library`  | `manage.py load_public_library` |

## Type generation

| Command       | Description                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gz_gentypes` | Regenerate `web/src/util/generated-types.ts` from the live OpenAPI schema. Starts the backend temporarily if it is not already running. |

## Calculated Fields

The field DSL supports read-only calculated fields using a recursive, strictly typed AST. These are evaluated on the backend and displayed in the frontend.

```yaml
fields:
  volume_shrinkage:
    label: Volume Shrinkage
    decimals: 1
    display_as: percent
    compute:
      op: difference
      args:
        - constant: 1
        - op: ratio
          args:
            - op: product
              args:
                - { field: glaze_fired.length_in, return_type: number }
                - { field: glaze_fired.width_in, return_type: number }
                - { field: glaze_fired.height_in, return_type: number }
            - op: product
              args:
                - {
                    field: submitted_to_bisque_fire.length_in,
                    return_type: number,
                  }
                - {
                    field: submitted_to_bisque_fire.width_in,
                    return_type: number,
                  }
                - {
                    field: submitted_to_bisque_fire.height_in,
                    return_type: number,
                  }
```

Supported operations: `sum`, `product`, `difference` (2 args), `ratio` (2 args).
Leaf nodes: `field` (e.g. `{ field: state_id.field_name, return_type: number }`) or `constant`.
Display options: `display_as: percent` (multiplies by 100 and adds `%`).

## Managing Public Libraries (Django Admin)

Some global types (currently **Clay Bodies** and **Glaze Types**) support a shared public library managed by site administrators. Public entries are visible to all authenticated users as read-only reference data; each user can also have their own private copies with unique names.

### Getting to the admin

1. Start the app with `gz_start`.
2. Go to `http://localhost:8080/admin/` and sign in with a Django superuser account.
   - To create a superuser: `gz_manage createsuperuser` (or `python manage.py createsuperuser`).

### The "Public Libraries" section

On the admin homepage, public library models appear in a dedicated **Public Libraries** section, separate from the general **Api** section. This section lists only public objects (those with no owner). Users' private copies are not shown here and remain accessible only via the shell/ORM.

### Adding or editing a public entry

1. Click a model name (e.g. "Clay Bodies") in the **Public Libraries** section.
2. Click **"Add Clay Body"** (or click an existing row to edit it).
3. Fill in the fields. The `User` field is hidden — public objects are always unowned.
4. For fields marked as an image in `workflow.yml` (e.g. the clay body or glaze type tile image):
   - If Cloudinary is configured, an **Upload Image** button appears next to the URL field. Clicking it opens the Cloudinary Upload Widget in a modal. On success, the image URL is written back into the field and a thumbnail preview is shown.
   - If Cloudinary is not configured, you can paste a URL directly into the text field.
5. Click **Save**.

### Name conflict rules

- **Public name must be unique** — you cannot save a public entry with the same name as another existing public entry.
- **Private entries may share a public name** — users can have their own private entry with the same name as a public entry. When both exist, the picker displays the public entry with a `(public)` suffix to distinguish the two.

### Enabling Cloudinary in the admin

Cloudinary uploads in the admin use the same backend-signed widget as the regular user UI. Set these env vars before starting Django:

```bash
export CLOUDINARY_CLOUD_NAME=<your-cloud-name>
export CLOUDINARY_API_KEY=<your-api-key>
export CLOUDINARY_API_SECRET=<your-api-secret>
```

The upload button is automatically hidden when these are not set; the plain URL field is always available as a fallback.

### Exporting and deploying the public library

Once you have authored public library entries via the admin, you can export them to a versioned fixture file and deploy them to other environments (staging, production) without SSH access.

**1. Export from your dev environment:**

```bash
gz_dump_public_library
```

This writes `fixtures/public_library.json` — a portable snapshot of every public object across all `public: true` globals (currently Clay Bodies and Glaze Types). The `pk` and `user` fields are excluded so the file works across databases.

**2. Commit and open a PR:**

```bash
git add fixtures/public_library.json
git commit -m "Update public library"
# open a PR as usual
```

**3. Automatic deployment on merge:**

When the PR merges, CI builds and pushes a new Docker image. On the next `docker compose up -d`, `deploy_init` applies migrations, loads the public library, and clears stuck tasks before the app container starts:

```bash
python manage.py migrate --no-input &&
python manage.py load_public_library --skip-if-missing &&
python manage.py clear_stuck_tasks --hours 1
```

`load_public_library` does an idempotent `update_or_create` for each record — running it multiple times is safe. The `--skip-if-missing` flag lets fresh deployments start cleanly before any fixture has been committed yet.

**Optional path overrides:**

```bash
# Load from a non-default path:
gz_load_public_library --fixture path/to/custom.json

# Export to a non-default path:
gz_dump_public_library --output path/to/custom.json

# Inspect the export without writing a file:
gz_dump_public_library --output -
```
