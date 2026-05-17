# PotterDoc

[![CI](https://github.com/shaoster/glaze/actions/workflows/ci.yml/badge.svg)](https://github.com/shaoster/glaze/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/shaoster/glaze/graph/badge.svg)](https://codecov.io/gh/shaoster/glaze)
[![Logs](https://img.shields.io/badge/telemetry-logs-blue)](https://telemetry.betterstack.com/team/t539729/tail?s=2428269)

PotterDoc is the external product name for this app. The repository, internal code identifiers, and some contributor documentation still use `glaze` as the internal project name during the transition.

A pottery workflow tracking application. Log pieces and record state transitions as work moves through throwing, bisque firing, glazing, and finishing.

## Documentation

- [Backend API (`api/`)](api/README.md) - Django, DRF, public libraries, auth flows, and data isolation.
- [Frontend Client (`web/`)](web/README.md) - React components, Vite configuration, and frontend conventions.
- [Common Tests (`tests/`)](tests/README.md) - Structural tests for the workflow state machine.
- [Tools (`tools/`)](tools/README.md) - Standalone utilities, Modal crop offloading, and Glaze import tool.
- [Pages (`pages/`)](pages/README.md) - Static published pages.
- [Agent Workflows (`docs/agents/`)](docs/agents/AGENTS.md) - Context for AI assistants.

## For new developers

This guide assumes you already know the tools listed below and are familiar with [separation of concerns](https://en.wikipedia.org/wiki/Separation_of_concerns) and [abstraction](https://en.wikipedia.org/wiki/Abstraction_(computer_science)) as design principles; if any term is unfamiliar, click the linked docs to catch up quickly.

- **[Django](https://www.djangoproject.com/)** is the Python web framework that owns the backend (`backend/`, `api/`). [Separation of concerns](https://en.wikipedia.org/wiki/Separation_of_concerns) keeps unrelated responsibilities apart so each layer stays simpler to reason about—for example, [`api/models.py`](api/models.py) defines the data schema, [`api/serializers.py`](api/serializers.py) translates between ORM objects and JSON payloads, and [`api/views.py`](api/views.py) wires those serializers into `/api/...` endpoints that enforce workflow rules from [`workflow.yml`](workflow.yml). That split keeps the REST API (powered by Django REST Framework, DRF) resilient even when one layer needs to change, while returning consistent data/validation to all clients.
- **[React](https://react.dev/)** (web/src/) renders the SPA (Single Page Application) and consumes shared types/API helpers from [`web/src/util/types.ts`](web/src/util/types.ts) and [`web/src/util/api.ts`](web/src/util/api.ts). React follows a component-based paradigm where functions or classes receive props (inputs) and return HTML that the browser can render.
- **[Vite](https://vitejs.dev/)** (web tooling) bundles the React app. It provides fast dev reloads (hot module replacement) so UI changes appear immediately while you work, runs the local dev server that powers our web workbench, serves as the underlying runner for `bazel test //web:web_test`, and produces optimized production builds (tree shaking, minification) so the deployed bundle is as small and performant as possible.
- **[Material UI](https://mui.com/)** supplies the component library used everywhere in the UI for forms, dialogs, buttons, and layout.
- **[Axios](https://axios-http.com/)** is the HTTP client library we use in the web to talk to REST APIs; it keeps things simple by handling the details of sending and receiving JSON so the UI code does not have to repeat that work. Benefits of Axios over raw `fetch` include centralized configuration of base URLs and headers, automatic JSON parsing/serialization, and built-in hooks for handling errors, cancellations, and retries. In this project that means [`WorkflowState.tsx`](web/src/components/WorkflowState.tsx) can rely on helpers like `updateCurrentState`/`updatePiece` instead of duplicating URLs or JSON logic, and we have a single place for surfaces errors before they hit the UI.
- A **[client library](https://en.wikipedia.org/wiki/Library_(computing))** is a reusable set of functions that wraps low-level protocols (like HTTP) so developers can interact with remote services using clean function calls, in their programming language of choice, instead of handling bytes, headers, or parsing manually.

## Motivation

While the UI is similar at a surface level to other craft journaling applications, the main differences are under the hood:

- Customizable, potentially non-linear workflows. For some pieces you'll carve first, for others you'll slip first. For others, there might be multiple rounds of each.
- Opinionated data model with immutable stage data for your piece's unique journey and your growth-minded journey as a potter. You can't change the past, so keep moving forward. (Administrative bulk data cleaning is still allowed! And when you find a photo from an earlier stage later, the **rewind** feature lets you navigate back to that historical state to attach it — without altering the piece's actual history.)
- Data normalization around every piece's history for richer and more reliable single piece and multi-piece analysis.
- Systematically answer questions like "How many pieces do I lose in the firing stage by glaze type?" or "How often do I ruin a piece during trimming?"

## Prerequisites

Before cloning, ensure the following are installed on your system:

| Tool | Required | Install |
|---|---|---|
| OS | Ubuntu 22.04+ or Debian 12+ (WSL2 on Windows works; macOS untested) | — |
| [Bazelisk](https://github.com/bazelbuild/bazelisk) | Yes — aliased as `bazel`; downloads Bazel 8.5.1 automatically via `.bazelversion` | [Bazelisk releases](https://github.com/bazelbuild/bazelisk/releases) or `brew install bazelisk` |
| `curl` | Yes — used by `gz_setup` to bootstrap RTK | `apt install curl` |
| `git` | Yes | `apt install git` |

Python (3.12) and Node (22) are managed hermetically by Bazel — no manual installs needed once Bazelisk is present.

**VS Code users:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or Docker Engine (Linux) and the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers), then open the repo and choose **Reopen in Container** — the devcontainer pre-installs all prerequisites automatically.

The devcontainer pre-forwards backend ports `8080–8087` and Vite ports `5173–5180`. These ranges match the authorized origins registered in the Google OAuth client, and support up to 8 simultaneous worktree dev stacks. Running more than 8 concurrent `gz_start` instances inside the container is not supported — use the host environment instead if you need more.

## Quick start

This section is for folks who just want to fire up the whole stack quickly and start poking around the app.

```bash
source env.sh
gz_setup    # first-time only: creates venv, installs deps, runs migrations
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

### Vibe Coding With Agents

Glaze uses a high-level orchestration workflow inspired by the [Get Shit Done (GSD)](https://github.com/gsd-build/get-shit-done) philosophy, but adapted for non-developer QoL and safety with non-frontier models:

1.  **`/dream`**: High-level vision and milestone orchestration. Use this to describe a broad feature or user story. The agent will use Plan Mode to break the vision into logical sub-tasks, create a GitHub Milestone, and spawn sub-agents to author specific specs.
2.  **`/spec`**: Detail-oriented issue authoring. Each sub-task from the dream is turned into a precise GitHub issue with problem motivation, proposed solution, and acceptance criteria.
3.  **`/do`**: Execution. When you want an agent to implement an issue or start a PR-sized change, use the explicit issue flow: `/do #292`.
4.  **`/deps`**: Bazel dependency audit. Use this when you want an agent to inspect the rules_oci image target plus test and lint graphs for unexpected dependencies before planning cleanup work.

#### Our Architectural Principles for Agent Work:

- **Normative Content in GitHub**: Unlike some agent-first workflows that store state in local markdown files, Glaze keeps all normative requirements and status in **GitHub Issues, Milestones, and PRs**. This minimizes hallucinations from non-frontier models by using GitHub as the source of truth and ensures that the project remains accessible to human non-developer contributors via the standard GitHub UI.
- **Flexible Verification**: Verification can happen **synchronously** (as part of the `/do` cycle where the agent runs tests before pushing) or **asynchronously** in bulk using the `/audit` (performance/flakiness), `/cover` (coverage), and `/deps` (Bazel dependency graph audit) skills.

When you run `/do #292`, the agent will create a branch like `issue/292-vibe-coding-flow` and a repo-local worktree like `.agent-worktrees/codex/issue-292-vibe-coding-flow` before it analyzes or edits anything.
 The agent should immediately print a copy-friendly line:

```text
Worktree: /home/phil/code/glaze/.agent-worktrees/codex/issue-292-vibe-coding-flow
```

Open a dedicated terminal tab for that worktree and jump into it with:

```bash
gz_cd 292
```

From there, use the normal helpers:

```bash
gz_setup
gz_start
```

Each agent gets its own worktree under `.agent-worktrees/<agent>/...`, and each
issue gets its own branch. Keep one terminal per worktree so `gz_start`,
`gz_stop`, logs, and port files stay scoped to the right code checkout.

After the PR is merged or abandoned, stop any servers from that worktree's
terminal and clean up the local checkout:

```bash
gz_stop
git worktree remove .agent-worktrees/codex/issue-292-vibe-coding-flow
git worktree prune
git branch -d issue/292-vibe-coding-flow
```

Use `git branch -D` only for an abandoned unmerged branch after confirming the
work is no longer needed.

### Local secrets and config (git-safe)

Keep local-only settings in `.env.local` files; they are gitignored by default:

- `.env.local` (repo-wide defaults)
- `web/.env.local` (web-only overrides)

`source env.sh` automatically loads both (in that order) so you can inject Cloudinary/API config without committing secrets.
Use the checked-in templates:

```bash
cp .env.example .env.local
cp web/.env.example web/.env.local
```

### Setup

| Command    | Description                                                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
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

### Smoke-test large downloads with `gz_start`

When changing large download endpoints, run the app locally with `gz_start`,
trigger the same download three times in the browser, and watch the backend RSS:

```bash
BACKEND_PID=$(pgrep -f "uvicorn.*$(cat .dev-pids/backend.port)")
watch -n 1 "ps -o pid,rss,vsz,cmd -p ${BACKEND_PID}"
```

RSS may stay at a high-water mark after the first run, but repeated same-size
downloads should plateau rather than ratchet upward. For ASGI production parity,
repeat the check against Docker/staging and watch the Gunicorn/Uvicorn worker
RSS; large `StreamingHttpResponse` bodies should use async iterators.

### Testing

| Command           | Description                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `gz_test`         | Run all tests via Bazel (`bazel test --test_output=errors //...`) — CI-aligned, incremental. |
| `gz_test_common`  | Run workflow schema/integrity tests only (`bazel test //tests:common_test`).                 |
| `gz_test_backend` | Run Django API tests only (`bazel test //api:api_test`).                                     |
| `gz_test_web`     | Run web tests only (`bazel test //web:web_test`).                                            |

### Linting and type-checking

| Command   | Description                                                                 |
| --------- | --------------------------------------------------------------------------- |
| `gz_lint` | Run all linters via Bazel (`bazel build --config=lint //...`) — CI-aligned. |

### Build

| Command    | Description                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `gz_build` | Run the same frontend build command used in CI (`gz_gentypes` then `cd web && npm run build`, which expands to `tsc -b && vite build`). |

### JavaScript dev tools

Prefer Python for standalone dev tooling when the dependency graph allows it. Use the JS tool path under [`web/scripts/`](web/scripts/) when the tool is naturally coupled to the web dependency graph or when the needed package exists in npm but not pip. Wire those scripts through [`web/BUILD.bazel`](web/BUILD.bazel) with `js_binary` and add a `vitest_test` when you want the tool itself covered by tests. [`web/scripts/generate-types.mjs`](web/scripts/generate-types.mjs) and [`web/scripts/coverage-audit.mjs`](web/scripts/coverage-audit.mjs) are the current examples.

Run `gz_help` to print the full list of shortcuts at any time.

## Manual setup (without `env.sh`)

If you prefer to install dependencies and run servers yourself, follow these explicit commands instead of relying on the helper script.

```bash
# Backend
bazel run @uv//:uv -- sync
bazel run @uv//:uv -- run python manage.py migrate
uvicorn backend.asgi:application --port 8080 --reload

# Web (separate terminal)
cd web
bazel run @nodejs_linux_amd64//:npm -- install
bazel run @nodejs_linux_amd64//:npm -- run dev
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
cd web && bazel run @nodejs_linux_amd64//:npm -- run test:watch  # watch mode (no Bazel equivalent)
```

For more specifics on what is tested in each package, refer to the individual module `README.md` files:
- [Backend Tests](api/README.md#what-is-tested)
- [Frontend Tests](web/README.md#what-is-tested)
- [Common Tests](tests/README.md)

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

- Claude always runs `bazel test //api:api_test` (backend) and `bazel test //web:web_test` (web) before opening or updating a PR. If tests fail, it will not push.
- Claude derives all state names and transitions from [`workflow.yml`](workflow.yml) — you can reference state names freely in issues and it will use the correct values.
- For large or ambiguous requests, start with an issue rather than a direct PR comment so Claude can ask questions before writing code.

## Component Documentation

Interactive component stories are published to GitHub Pages via Storybook:

**[https://shaoster.github.io/glaze/storybook/](https://shaoster.github.io/glaze/storybook/)**

Run locally with `cd web && pnpm storybook`. See [`web/README.md`](web/README.md) for details.

## Deployment

PotterDoc supports Docker Compose (self-hosted on any VPS/droplet).

### Docker Compose (self-hosted)

The repo uses [`docker-compose.yml`](docker-compose.yml) for self-hosting on a single VPS (e.g. DigitalOcean, Hetzner, Linode). The container image is built by Bazel (`rules_oci`) — no Dockerfile needed.

**Architecture:**

- `web` — Gunicorn + uvicorn workers (ASGI) serving Django + the Vite-built frontend via WhiteNoise on port 8000
- `db` — Postgres 17 with a named volume for persistence

**How it works:**

- Every push to `main` that passes all tests triggers a `publish` job ([`ci.yml`](.github/workflows/ci.yml)) that builds the OCI image with Bazel (with `VITE_GOOGLE_CLIENT_ID` baked in from a GitHub Actions secret) and pushes it to `ghcr.io/shaoster/glaze:latest`. On success, [`cd.yml`](.github/workflows/cd.yml) automatically deploys the new image to the droplet and creates a GitHub release marking the deployed SHA.
- The droplet never needs git, Node, or Python build tools — it just pulls the pre-built image.
- Migrations and `collectstatic` run automatically inside the container on every start (via [`docker-entrypoint.sh`](docker-entrypoint.sh)).
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
docker login ghcr.io -u shaoster -p YOUR_PAT

# Pull and start the stack
cd ~/glaze
docker compose up -d
```

**Subsequent deploys** (from your local machine):

```bash
# Add to .env.local:  GLAZE_PROD_HOST=user@your-droplet
gz_deploy
```

`gz_deploy` builds and pushes the OCI image (tagged with HEAD SHA and `:latest`), then SSHes into the droplet via [`deploy.sh`](deploy.sh) to pull the new image and restart the service. Pass `--no-push` to skip the build and redeploy the image already in the registry. No source code needed on the droplet.

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

## Project structure

```
backend/          Django project settings, root URL config
api/              Models, serializers, views, tests
  model_factories.py  Auto-generates GlobalModel subclasses from workflow.yml
web/
  src/
    util/
      generated-types.ts  Auto-generated OpenAPI types (gitignored)
      types.ts            Domain types/constants derived from generated-types.ts
      api.ts              HTTP calls; wire-type → domain-type mapping
      workflow.ts         Workflow helpers loaded from workflow.yml
    components/         React components
    App.tsx             Root component with MUI dark theme
workflow.yml               Source of truth for piece states and valid transitions
env.sh                     Development shell helpers
docker-compose.yml         Production stack: web + Postgres
docker-entrypoint.sh       Container startup: migrate, collectstatic, exec Gunicorn
deploy.sh                  SSH deploy helper (called by gz_deploy)
.env.production.example    Template for droplet secrets (copy to .env)
render.yaml                Render Blueprint for managed PaaS deployment
```

The workflow state machine and all valid transitions are defined in [`workflow.yml`](workflow.yml). Both the backend and web derive state names and transition rules from this file — nothing is hardcoded elsewhere.

`workflow.yml` also contains two optional sections beyond the state list:

- **`globals`** — named domain types backed by Django models. Each entry drives both the backend and frontend: `api/model_factories.py` auto-generates the Django model class at import time (a `makemigrations` run is all that is needed to add a new global), and the frontend reads the same declaration to render pickers and resolve display fields. Set `factory: false` for globals whose model is hand-written (currently only `piece`).
- **`custom_fields`** (per-state) — state-specific fields declared using the embedded DSL. See `api/README.md` and `web/README.md` for more details.
