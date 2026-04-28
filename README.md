# PotterDoc

[![CI](https://github.com/shaoster/glaze/actions/workflows/ci.yml/badge.svg)](https://github.com/shaoster/glaze/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/shaoster/glaze/graph/badge.svg)](https://codecov.io/gh/shaoster/glaze)

PotterDoc is the external product name for this app. The repository, internal code identifiers, and some contributor documentation still use `glaze` as the internal project name during the transition.

A pottery workflow tracking application. Log pieces and record state transitions as work moves through throwing, bisque firing, glazing, and finishing.

## For new developers

This guide assumes you already know the tools listed below and are familiar with [separation of concerns](https://en.wikipedia.org/wiki/Separation_of_concerns) and [abstraction](<https://en.wikipedia.org/wiki/Abstraction_(computer_science)>) as design principles; if any term is unfamiliar, click the linked docs to catch up quickly.

- **[Django](https://www.djangoproject.com/)** is the Python web framework that owns the backend (`backend/`, `api/`). [Separation of concerns](https://en.wikipedia.org/wiki/Separation_of_concerns) keeps unrelated responsibilities apart so each layer stays simpler to reason about—for example, [`api/models.py`](api/models.py) defines the data schema, [`api/serializers.py`](api/serializers.py) translates between ORM objects and JSON payloads, and [`api/views.py`](api/views.py) wires those serializers into `/api/...` endpoints that enforce workflow rules from [`workflow.yml`](workflow.yml). That split keeps the REST API (powered by Django REST Framework, DRF) resilient even when one layer needs to change, while returning consistent data/validation to all clients.
- **[React](https://react.dev/)** (web/src/) renders the SPA (Single Page Application) and consumes shared types/API helpers from [`frontend_common/src/types.ts`](frontend_common/src/types.ts) and [`frontend_common/src/api.ts`](frontend_common/src/api.ts). React follows a component-based paradigm where functions or classes receive props (inputs) and return HTML that the browser can render.
- **[Vite](https://vitejs.dev/)** (web tooling) bundles the React app. It provides fast dev reloads (hot module replacement) so UI changes appear immediately while you work, runs the local dev server that powers our web workbench, serves as the underlying runner for `npm test`, and produces optimized production builds (tree shaking, minification) so the deployed bundle is as small and performant as possible.
- **[Material UI](https://mui.com/)** supplies the component library used everywhere in the UI for forms, dialogs, buttons, and layout.
- **[Axios](https://axios-http.com/)** is the HTTP client library we use in the web to talk to REST APIs; it keeps things simple by handling the details of sending and receiving JSON so the UI code does not have to repeat that work. Benefits of Axios over raw `fetch` include centralized configuration of base URLs and headers, automatic JSON parsing/serialization, and built-in hooks for handling errors, cancellations, and retries. In this project that means [`WorkflowState.tsx`](web/src/components/WorkflowState.tsx) can rely on helpers like `updateCurrentState`/`updatePiece` instead of duplicating URLs or JSON logic, and we have a single place for surfaces errors before they hit the UI.
- A **[client library](<https://en.wikipedia.org/wiki/Library_(computing)>)** is a reusable set of functions that wraps low-level protocols (like HTTP) so developers can interact with remote services using clean function calls, in their programming language of choice, instead of handling bytes, headers, or parsing manually.

## Motivation

While the UI is similar at a surface level to other craft journaling applications, the main differences are under the hood:

- Customizable, potentially non-linear workflows. For some pieces you'll carve first, for others you'll slip first. For others, there might be multiple rounds of each.
- Opinionated data model with immutable stage data for your piece's unique journey and your growth-minded journey as a potter. You can't change the past, so keep moving forward. (Administrative bulk data cleaning is still allowed!)
- Data normalization around every piece's history for richer and more reliable single piece and multi-piece analysis.
- Systematically answer questions like "How many pieces do I lose in the firing stage by glaze type?" or "How often do I ruin a piece during trimming?"

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

1. **Frontend**: The web app uses `@react-oauth/google` to display a Google Sign-In button when `VITE_GOOGLE_CLIENT_ID` is configured.
2. **Google Authentication**: User clicks the button, Google handles authentication and returns a JWT credential.
3. **Backend Verification**: The frontend sends the JWT to `POST /api/auth/google/`, where Django verifies the token with Google's servers using `google-auth`.
4. **User Creation/Login**:
   - If the Google subject ID exists in `UserProfile.openid_subject`, the existing user is logged in.
   - If not, the system looks for an existing user with the same email address (graceful migration from email/password accounts).
   - If no user exists, a new account is created with an unusable password (Google-only account).
5. **Profile Sync**: User profile information (name, picture) is updated from Google on each login.

**Environment Variables Required:**

- `GOOGLE_OAUTH_CLIENT_ID`: Your Google OAuth client ID from Google Cloud Console
- `VITE_GOOGLE_CLIENT_ID`: Same client ID, exposed to the frontend (must match backend)

**Google Cloud Setup:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable the Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized origins: `http://localhost:5173` (dev), your production domain
6. Add authorized redirect URIs: `http://localhost:5173` (dev), your production domain

Per-user data isolation rules:

- Every user-owned domain object (`Piece`, `PieceState`, `Location`, `ClayBody`, `GlazeType`, `GlazeMethod`) has a `user` foreign key.
- List endpoints only return objects for `request.user`.
- Detail/update endpoints fetch objects from a user-filtered queryset. If another user's ID is requested, the API returns `404` (not `403`) to avoid leaking object existence.
- Global reference entries are user-scoped; names are unique per user (for example, two users can both have a `Location` named "Kiln A" without colliding).

## React components

The web UI is organized around a small set of React components in [`web/src/components/`](web/src/components/). Each component owns a distinct slice of product behavior:

- [`NewPieceDialog.tsx`](web/src/components/NewPieceDialog.tsx): Creates a new piece from the list page, including name entry, optional notes, location selection/creation, curated thumbnail picking, save validation, and discard-confirmation when the form is dirty.
- [`PieceList.tsx`](web/src/components/PieceList.tsx): Renders the main pieces table with thumbnail, name, current state, created date, and last modified date, and supports navigation into a piece detail page from each row.
- [`PieceDetail.tsx`](web/src/components/PieceDetail.tsx): Displays a single piece header, renders the current editable workflow state, exposes valid next-state transitions from `workflow.yml`, blocks navigation when edits are unsaved, and lets the user expand past state history with image previews.
- [`WorkflowState.tsx`](web/src/components/WorkflowState.tsx): Handles editing the current state itself, including notes, current location, workflow-driven additional fields, save/error states, image URL entry, optional Cloudinary uploads, caption editing, image removal, and lightbox launch for current-state images.
- [`GlobalFieldPicker.tsx`](web/src/components/GlobalFieldPicker.tsx): Provides the reusable autocomplete used for workflow globals such as locations, including fetching existing options, selecting an existing entry, and inline creation of new global records when allowed by the field definition.
- [`ImageLightbox.tsx`](web/src/components/ImageLightbox.tsx): Shows piece images in a full-screen modal with captions plus desktop button navigation and touch swipe navigation for browsing multiple images.

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

**VS Code / Cursor:** the repo ships a terminal profile in [`.vscode/settings.json`](.vscode/settings.json) that automatically sources `env.sh` in every new integrated terminal — no manual step needed. The venv is activated and `gz_*` helpers are available from the moment the terminal opens.

**AI coding agents (Claude Code, Codex, Cursor agent):** a companion script [`env-agent.sh`](env-agent.sh) provides a silent, lightweight bootstrap (venv activation + `.env.local` loading) for non-interactive shells. Claude Code picks it up via `.claude/settings.json`; Codex and other agents inherit it through `BASH_ENV` when launched from an `env.sh`-sourced terminal. Prefer repo-local worktrees under `.agent-worktrees/...` instead of `/tmp`; the bootstrap detects the active git worktree root automatically and falls back to the main checkout's `.env.local` and `.venv` when the worktree does not have its own yet. `gz_setup` reuses the shared `.venv` and `web/node_modules` by default, and `gz_setup --isolated` creates worktree-local dependency installs when a branch is changing Python or Node packages. Keep repo-local Codex-specific config in `.agent-config/codex/` rather than `.codex`, which may be reserved by the local Codex installation. See [`docs/agents/dev.md`](docs/agents/dev.md) for details.

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

The app runs without any credentials — both optional services degrade gracefully when unconfigured:

- **Cloudinary** (image uploads): see [Cloudinary image uploads](#cloudinary-image-uploads-web) for how to get credentials and which vars to set.
- **Google OAuth** (sign-in button): see [Google OAuth](#google-oauth-web) for how to create a client ID and which vars to set.

### Setup

| Command    | Description                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `gz_setup` | Setup helper: reuses shared deps by default in repo-local worktrees, or use `gz_setup --isolated` for fresh worktree-local `.venv` and `web/node_modules`. Also runs DB migrations and installs Node via nvm if needed. |

### Servers

| Command                  | Description                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `gz_start`               | Start backend and web, join in the foreground. Ctrl+C stops both. Rotates old logs before starting. |
| `gz_stop`                | Stop both servers.                                                                                  |
| `gz_status`              | Show whether backend and web are running.                                                           |
| `gz_backend`             | Start the Django backend on port 8080 (backgrounded).                                               |
| `gz_web`                 | Start the Vite dev server (backgrounded). Prints the local URL once ready.                          |
| `gz_logs [backend\|web]` | Tail logs. Omit argument to tail both.                                                              |

Logs are written to `.dev-logs/` and rotated with a timestamp on each `gz_start`.

### Django management

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

### Testing

| Command           | Description                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `gz_test`         | Run all tests via Bazel (`bazel test --test_output=errors //...`) — CI-aligned, incremental. |
| `gz_test_common`  | Run workflow schema/integrity tests only (`pytest tests/`).                                  |
| `gz_test_backend` | Run Django API tests only (`pytest api/`).                                                   |
| `gz_test_web`     | Run web tests only (`npm test`).                                                             |

### Linting and type-checking

| Command   | Description                                                                 |
| --------- | --------------------------------------------------------------------------- |
| `gz_lint` | Run all linters via Bazel (`bazel build --config=lint //...`) — CI-aligned. |

### Build

| Command    | Description                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `gz_build` | Run the same frontend build command used in CI (`gz_gentypes` then `cd web && npm run build`, which expands to `tsc -b && vite build`). |

### Type generation

| Command       | Description                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
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

## Testing and validation

Tests and linters run via [Bazel](https://bazel.build/) — the same commands work locally and in CI.

```bash
# Run all tests (workflow, backend, web, mypy)
bazel test //...

# Run all linters (ruff, eslint, tsc, mypy)
bazel build --config=lint //...

# Or via env.sh helpers (source env.sh first):
gz_test          # bazel test --test_output=errors //...
gz_lint          # bazel build --config=lint //...
```

**Before committing** — auto-fix Python formatting and fixable lint issues:

```bash
source env.sh && gz_format
# equivalent to: ruff format . && ruff check --fix .
```

**For fast iteration** — run individual Bazel targets (incremental, CI-aligned):

```bash
bazel test //tests:...        # workflow schema validation
bazel test //api:api_test     # backend API tests
bazel test //api:api_mypy     # mypy type-check (full Django plugin)
bazel test //web:web_test     # web component tests
cd web && npm run test:watch  # watch mode (no Bazel equivalent)
```

## Cloudinary image uploads (web)

Images attached to piece states are uploaded via the [Cloudinary Upload Widget](https://cloudinary.com/documentation/upload_widget) using backend-signed uploads — `CLOUDINARY_API_SECRET` never reaches the browser.

Set these in `.env.local` before starting Django:

```bash
export CLOUDINARY_CLOUD_NAME=<your-cloud-name>
export CLOUDINARY_API_KEY=<your-api-key>
export CLOUDINARY_API_SECRET=<your-api-secret>
export CLOUDINARY_UPLOAD_FOLDER=glaze   # optional; images are placed in this folder
```

**How it works:**

1. `WorkflowState` calls `GET /api/uploads/cloudinary/widget-config/` to retrieve the cloud name, API key, and optional folder.
2. The Cloudinary Upload Widget opens in the browser. For each upload, the widget calls `POST /api/uploads/cloudinary/widget-signature/` to get a server-signed signature.
3. On success, the widget returns a `secure_url` and `public_id`. These are stored alongside the image in the `CaptionedImage` record.
4. Images are rendered via `CloudinaryImage`, which uses `public_id` to request viewport-appropriate renditions (auto format, auto quality, size-matched to context).

Cloudinary is optional — if the env vars are not set, the config endpoint returns 503 and the UI falls back to URL-paste mode.

## Google OAuth (web)

PotterDoc supports Google Sign-In using OAuth 2.0 with OpenID Connect. To enable the Google sign-in button in the web UI:

1. **Create Google OAuth credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create/select a project
   - Enable the Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized origins: `http://localhost:5173` (dev), your production domain
   - Add authorized redirect URIs: `http://localhost:5173` (dev), your production domain

2. **Configure environment variables:**
   Set these in `.env.local` before starting the development server:

   ```bash
   export GOOGLE_OAUTH_CLIENT_ID=<your-google-client-id>
   export VITE_GOOGLE_CLIENT_ID=<same-client-id>
   ```

   The `GOOGLE_OAUTH_CLIENT_ID` is used by the Django backend to verify Google JWT tokens.
   The `VITE_GOOGLE_CLIENT_ID` is exposed to the frontend and must match the backend value.

3. **User flow:**
   - Existing email/password users can sign in with Google (account linking)
   - New Google users get accounts created automatically
   - Profile information (name, picture) syncs from Google on each login

## Deployment

PotterDoc supports Docker Compose (self-hosted on any VPS/droplet).

### Docker Compose (self-hosted)

The repo ships a [`Dockerfile`](Dockerfile) and [`docker-compose.yml`](docker-compose.yml) for self-hosting on a single VPS (e.g. DigitalOcean, Hetzner, Linode).

**Architecture:**

- `web` — Gunicorn serving Django + the Vite-built frontend via WhiteNoise on port 8000
- `db` — Postgres 17 with a named volume for persistence

**How it works:**

- Every push to `main` that passes all tests triggers a GitHub Actions `publish` job ([`ci.yml`](.github/workflows/ci.yml)) that builds the Docker image (with `VITE_GOOGLE_CLIENT_ID` baked in from a GitHub Actions secret) and pushes it to `ghcr.io/shaoster/glaze:latest`. On success, [`cd.yml`](.github/workflows/cd.yml) automatically deploys the new image to the droplet and creates a GitHub release marking the deployed SHA.
- The droplet never needs git, Node, or Python build tools — it just pulls the pre-built image.
- Migrations run automatically inside the container on every start (via [`docker-entrypoint.sh`](docker-entrypoint.sh)).
- Runtime secrets (`SECRET_KEY`, `DATABASE_URL`, `CLOUDINARY_*`, etc.) live only in `.env` on the droplet and are never part of the image.

**One-time GitHub setup:**

Add `VITE_GOOGLE_CLIENT_ID` to your repo's Actions secrets (**Settings → Secrets and variables → Actions**), set to the same value as your Google OAuth client ID. Leave it empty to build without Google Sign-In.

**First-time setup on the droplet:**

```bash
# Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh

# Copy docker-compose.yml and configure secrets (no need to clone the full repo)
mkdir ~/glaze
scp docker-compose.yml user@your-droplet:~/glaze/
scp .env.production.example user@your-droplet:~/glaze/.env
# edit ~/glaze/.env — fill in SECRET_KEY, POSTGRES_PASSWORD, ALLOWED_HOST, APP_ORIGIN, etc.

# Authenticate with GitHub Container Registry (one-time)
# Create a classic PAT at github.com/settings/tokens with read:packages scope
docker login ghcr.io -u shaoster -p <your-PAT>

# Pull and start the stack
cd ~/glaze
docker compose up -d
```

**Subsequent deploys** (from your local machine):

```bash
./deploy.sh user@your-droplet
```

`deploy.sh` SSHes into the droplet, pulls the latest image from ghcr.io, and restarts the `web` service. No source code needed on the droplet.

**Environment variables** (set in `.env` on the droplet):

| Variable                   | Required | Description                                                                                      |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `SECRET_KEY`               | Yes      | Django secret key — generate with `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `POSTGRES_PASSWORD`        | Yes      | Password for the Postgres `glaze` user                                                           |
| `ALLOWED_HOST`             | Yes      | Hostname of the droplet, e.g. `myapp.example.com`                                                |
| `APP_ORIGIN`               | Yes      | Full origin URL, e.g. `https://myapp.example.com`                                                |
| `GOOGLE_OAUTH_CLIENT_ID`   | No       | Backend runtime verification of Google JWTs                                                      |
| `CLOUDINARY_CLOUD_NAME`    | No       | Enable Cloudinary image uploads                                                                  |
| `CLOUDINARY_API_KEY`       | No       | Cloudinary API key                                                                               |
| `CLOUDINARY_API_SECRET`    | No       | Cloudinary API secret                                                                            |
| `CLOUDINARY_UPLOAD_FOLDER` | No       | Cloudinary folder for uploaded images                                                            |
| `CLOUDINARY_UPLOAD_PRESET` | No       | Cloudinary upload preset (passed to the Upload Widget as `uploadPreset`)                         |

Note: `VITE_GOOGLE_CLIENT_ID` is **not** set here — it is baked into the JS bundle at CI build time via the GitHub Actions secret.

**Local overrides:** create `docker-compose.override.yml` (gitignored) to customize port bindings or mount volumes during local Docker testing without touching the main compose file.

**Setting up Nginx + SSL (one-time, after first `docker compose up -d`):**

```bash
./setup-nginx.sh user@your-droplet myapp.example.com admin@example.com
```

[`setup-nginx.sh`](setup-nginx.sh) installs Nginx and Certbot on the droplet, copies [`nginx/glaze.conf`](nginx/glaze.conf) with your domain substituted in, opens ports 80/443 in the firewall, and runs `certbot --nginx` to provision a Let's Encrypt cert. Certbot rewrites the Nginx config in-place to add TLS and sets up automatic renewal via a systemd timer.

**Prerequisites:**

- A domain with a DNS A record pointing at the droplet's IP (must be propagated before running Certbot)
- `ufw` active on the droplet (`ufw enable`)

**After initial setup**, the Nginx config lives at `/etc/nginx/sites-available/glaze` on the droplet. Do not re-run `setup-nginx.sh` or overwrite that file — you will lose the TLS configuration Certbot added. To make intentional Nginx config changes, edit the file on the droplet directly and run `systemctl reload nginx`.

**Alternative: Tailscale (no public domain required)**

If you don't have a public domain, or want the app private to your devices, use Tailscale instead. The app gets a valid HTTPS cert for its `*.ts.net` MagicDNS hostname and is only reachable from devices on your Tailscale network.

**Before running the script:**

1. Enable **HTTPS Certificates** and **MagicDNS** in the [Tailscale admin console](https://login.tailscale.com/admin/dns)
2. Generate an auth key at [Tailscale admin → Keys](https://login.tailscale.com/admin/settings/keys)
3. Install Tailscale on your local machine/devices so they can reach the droplet

```bash
./setup-tailscale.sh user@your-droplet tskey-auth-xxxxx
```

[`setup-tailscale.sh`](setup-tailscale.sh) installs Tailscale and Nginx, authenticates the droplet, issues a TLS cert via `tailscale cert`, configures Nginx with the `*.ts.net` hostname, restricts ports 80/443 to the Tailscale subnet only (port 8000 is also closed), and installs a weekly cron job to renew the cert.

After setup, the app is reachable at `https://<droplet-name>.tail<id>.ts.net` from any device on your Tailscale network. To find the exact URL, run `tailscale status` on the droplet or check the [Tailscale admin console](https://login.tailscale.com/admin/machines).

---

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
| [`test_globals.py`](api/tests/test_globals.py) | `GlobalModel` registry invariants (parameterised over all registered models): `name` field presence, user immutability, workflow consistency; `GET/POST /api/globals/<name>/` list and create |
| [`test_glaze_combination.py`](api/tests/test_glaze_combination.py) | `GlazeCombination` computed `name` field, public/private FK constraint, `GlazeType.name` separator validation, API GET/POST |

**Web** (`web/src/` and `frontend_common/src/`):
| File | What it covers |
|---|---|
| [`frontend_common/src/workflow.test.ts`](frontend_common/src/workflow.test.ts) | `formatWorkflowFieldLabel`, `getGlobalDisplayField`, `getAdditionalFieldDefinitions` (inline, state ref, global ref) — decoupled from real `workflow.yml` via `vi.mock` |
| [`__tests__/GlobalFieldPicker.test.tsx`](web/src/components/__tests__/GlobalFieldPicker.test.tsx) | Rendering, internal fetch, provided options, create sentinel, inline creation (success/error), selecting existing |
| [`__tests__/PieceList.test.tsx`](web/src/components/__tests__/PieceList.test.tsx) | Column headers, empty state, per-row data, links |
| [`__tests__/NewPieceDialog.test.tsx`](web/src/components/__tests__/NewPieceDialog.test.tsx) | Rendering, name/notes/location/thumbnail, save/cancel behavior |
| [`__tests__/WorkflowState.test.tsx`](web/src/components/__tests__/WorkflowState.test.tsx) | Notes, additional fields (inline, state ref, global ref), location, save button, unsaved indicator |
| [`__tests__/PieceDetail.test.tsx`](web/src/components/__tests__/PieceDetail.test.tsx) | Rendering, state transitions, confirmation dialog, location editing |

## Agent documentation (`docs/agents/`)

Agent and contributor documentation lives in [`docs/agents/`](docs/agents/) and is split across five files so that the generic stack guides can be reused in other projects. [`AGENTS.md`](AGENTS.md) at the repo root is a slim wrapper that imports all five via `@` directives.

| File                                                                           | Contents                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/agents/glaze-domain.md`](docs/agents/glaze-domain.md)                   | Everything specific to this project: workflow state machine, `additional_fields` DSL, data model, key constraints, and Glaze-specific conventions layered on top of each stack (Django model patterns, frontend module aliases, component inventory, Cloudinary/OAuth flows, protected files, project-specific definition-of-done checks). **Add content here** when it is specific to Glaze's domain, data model, or architecture. |
| [`docs/agents/django-drf-python.md`](docs/agents/django-drf-python.md)         | Generic Django + DRF conventions reusable in any project: serializer rules, CORS, session auth, user-isolation patterns, test approach. **Add content here** only if it applies to Django/DRF projects in general, with no Glaze-specific models or endpoints.                                                                                                                                                                      |
| [`docs/agents/typescript-react-vite.md`](docs/agents/typescript-react-vite.md) | Generic React + TypeScript + Vite conventions reusable in any project: MUI usage, strict TS rules, theming tokens, Axios usage, async test patterns. **Add content here** only if it applies to React/TS/Vite projects in general, with no Glaze-specific components or data pipelines.                                                                                                                                             |
| [`docs/agents/github-interactions.md`](docs/agents/github-interactions.md)     | Generic GitHub agent conventions reusable in any project: `--body-file` pattern, branch naming, scope-limit categories, PR ownership labels, definition-of-done checklist. **Add content here** only if it applies to any GitHub-hosted project.                                                                                                                                                                                    |
| [`docs/agents/dev.md`](docs/agents/dev.md)                                     | Glaze-specific development setup and test commands: starting the backend and web, all three test suites, CI, and per-layer "what to test" checklists. **Add content here** for setup steps, test commands, or CI details specific to this repo.                                                                                                                                                                                     |

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
  model_factories.py  Auto-generates GlobalModel subclasses from workflow.yml
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
workflow.yml               Source of truth for piece states and valid transitions
env.sh                     Development shell helpers
Dockerfile                 Multi-stage build (builder + lean runtime image)
docker-compose.yml         Production stack: web + Postgres
docker-entrypoint.sh       Container startup: migrate then exec Gunicorn
deploy.sh                  One-command deploy to a remote droplet via SSH
.env.production.example    Template for droplet secrets (copy to .env)
render.yaml                Render Blueprint for managed PaaS deployment
```

The workflow state machine and all valid transitions are defined in [`workflow.yml`](workflow.yml). Both the backend and web derive state names and transition rules from this file — nothing is hardcoded elsewhere.

`workflow.yml` also contains two optional sections beyond the state list:

- **`globals`** — named domain types backed by Django models. Each entry drives both the backend and frontend: `api/model_factories.py` auto-generates the Django model class at import time (a `makemigrations` run is all that is needed to add a new global), and the frontend reads the same declaration to render pickers and resolve display fields. Set `factory: false` for globals whose model is hand-written (currently only `piece`).
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

(\*Inline field: renders as a numeric input.)

```yaml
- id: trimmed
  additional_fields:
    pre_trim_weight_grams:
      $ref: "wheel_thrown.clay_weight_grams"
```

(\*State ref: carries the earlier measurement forward.)

```yaml
- id: wheel_thrown
  additional_fields:
    clay_body:
      $ref: "@clay_body.name"
      can_create: true
```

(\*Global ref: renders an Autocomplete tied to the `clay_body` global, with inline creation.)

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

## Managing Public Libraries (Django Admin)

Some global types (currently **Clay Bodies** and **Glaze Types**) support a shared public library managed by site administrators. Public entries are visible to all authenticated users as read-only reference data; each user can also have their own private copies with unique names.

### Getting to the admin

1. Start the backend (`gz_backend` or `python manage.py runserver 8080`).
2. Go to `http://localhost:8080/admin/` and sign in with a Django superuser account.
   - To create a superuser: `gz_manage createsuperuser` (or `python manage.py createsuperuser`).

### The "Public Libraries" section

On the admin homepage, public library models appear in a dedicated **Public Libraries** section, separate from the general **Api** section. This section lists only public objects (those with no owner). Users' private copies are not shown here and remain accessible only via the shell/ORM.

### Adding or editing a public entry

1. Click a model name (e.g. "Clay Bodies") in the **Public Libraries** section.
2. Click **"Add Clay Body"** (or click an existing row to edit it).
3. Fill in the fields. The `User` field is hidden — public objects are always unowned.
4. For fields marked as an image in [`workflow.yml`](workflow.yml) (e.g. the clay body or glaze type tile image):
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

When the PR merges, CI builds and pushes a new Docker image. On the next `docker compose up -d`, the container runs [`docker-entrypoint.sh`](docker-entrypoint.sh), which includes:

```bash
gz_load_public_library --skip-if-missing
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

## Glaze Import Tool

The **Glaze Import Tool** at `/tools/glaze-import` is a browser-based admin workflow for seeding the public `GlazeType` and `GlazeCombination` libraries from physical test-tile photographs (JPEG, PNG, or HEIC via Cloudinary). It replaces manual admin entry for bulk imports.

> Only staff users (`is_staff = True`) can access this tool.

### The five-step flow

1. **Upload** — drag-and-drop or select source images from disk, or use the Cloudinary widget for HEIC/HEIF files (Cloudinary converts them to JPEG automatically).
2. **Crop** — draw a rotatable square crop box over each image. The box may extend beyond the image boundary; overflow becomes transparent. A live preview updates after 200 ms of inactivity.
3. **OCR** — optionally draw a rotatable OCR region box on the crop preview to focus text extraction. Click **Run OCR For All Records** — Tesseract reads each region and auto-fills the name, glaze kind, first/second glaze, runs, and food-safe fields. OCR understands structured labels (`1st Glaze: …` / `2nd Glaze: …`) and annotation lines (`CAUTION: RUNS`, `NOT FOOD SAFE`).
4. **Review** — verify and correct each record's parsed fields, then check the **Reviewed** box. Combination names are auto-computed as `<first>!<second>` and are read-only.
5. **Import** — sends all reviewed records and compressed crop images to the backend. A per-record progress list tracks each file; results show admin links to every created object.

If any records are skipped as duplicates, a **6. Reconcile** tab appears with the scraped fields and a direct link to the existing admin record.

### What the import creates

| Record kind         | Created objects                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `glaze_type`        | Public `GlazeType` + a matching single-layer public `GlazeCombination`                                                    |
| `glaze_combination` | Public `GlazeCombination` with two ordered layers (both referenced `GlazeType` rows must already exist as public records) |

`runs` and `is_food_safe` parsed from OCR are written to both `GlazeType` and `GlazeCombination` on creation.

After a successful import, export and deploy the updated library:

```bash
gz_dump_public_library
git add fixtures/public_library.json
git commit -m "Update public library after glaze import"
```
