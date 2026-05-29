---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: dev-environment
description: |
  Glaze dev environment setup: shell bootstrap (env.sh / env-agent.sh), VS Code
  terminal profile, Claude Code BASH_ENV, worktree navigation (gz_cd, gz_worktrees),
  one-terminal-per-worktree rule, running servers (gz_start/gz_stop), the dev login
  flow (mock-IdP no-credential sign-in that auto-seeds sample pieces), production
  backup & local restore (gz_backup / gz_restore), environment variables, worktree
  database isolation (gz_start db resolution, bazel run //:manage footgun), and
  .env.local copy pitfalls. Invoke when setting up a fresh environment, navigating
  worktrees, running servers locally, logging in to the dev server, loading real or
  sample data, or troubleshooting database/env-var mismatches in a worktree.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Glaze Development Environment

## Initial Setup

```bash
# Backend
uv sync
uv run python manage.py migrate

# Web (separate terminal)
cd web
npm install
```

> **Agents: source `env-agent.sh`, never `env.sh`.** `env.sh` is the **human**
> entry point — it sources `~/.bashrc` and unsets `GLAZE_AGENT`, dropping the
> `rtk` token-saving prefix that agent sessions rely on. Agents already get
> `env-agent.sh` automatically via `BASH_ENV` (see Claude Code note below), so
> normally you don't source anything by hand. If you must bootstrap explicitly,
> run `source env-agent.sh`. Never run `source env.sh`, and never use helpers
> that re-source it (e.g. `gz_reload`).

For **humans** in a new interactive shell, run `source env.sh` before doing anything else.
The bootstrap lazily materializes the minimal local state needed for a healthy shell
and keeps the repo-local developer environment consistent across worktrees.

## Shell Bootstrap

| Script | Purpose |
|---|---|
| `env.sh` | Interactive shells: sources `~/.bashrc`, then delegates to `env-agent.sh`. Used as `bash --rcfile` by the VS Code profile. Does **not** define helpers itself. |
| `env-agent.sh` | The authoritative bootstrap: activates `.venv` if present, loads `.env.local` vars, exports `BASH_ENV`, **and defines all `gz_*` helper functions** |

`env.sh` sources `env-agent.sh` — venv activation, env-var loading, and every `gz_*` helper
definition live in one place. **To find what a `gz_*` command actually does, read
`env-agent.sh`, not `env.sh`** (e.g. `gz_backup` at L412, `gz_restore` at L474, the
`_GZ_SHORTCUTS` catalogue at L1161). `gz_help` prints the full list at runtime.

**VS Code / Cursor:** `.vscode/settings.json` configures a `glaze` terminal profile running
`bash --rcfile env.sh`. New terminals automatically get the full interactive environment.
`python.terminal.activateEnvironment` is disabled to avoid double-activation.

**Claude Code:** `.claude/settings.json` sets `BASH_ENV=/path/to/env-agent.sh`. Every
`bash -c "..."` command sources `env-agent.sh` first, so `python`, `pytest`, `npm`, and
`.env.local` vars are available without manual activation.

## Worktree Navigation

```bash
gz_worktrees          # list all worktrees with branch names, paths, ● for running servers
gz_cd <pattern>       # cd to a worktree by path pattern (issue number or branch slug)
```

Example output:
```
  main                          /home/phil/code/glaze
  issue/123-fix-foo             /home/phil/code/glaze/.agent-worktrees/claude/issue-123-fix-foo  ●
```

`gz_cd 123` or `gz_cd issue-456` jumps to the matching worktree and re-sources `env.sh`.
`gz_cd` blocks the switch if servers are currently running — `gz_stop` first or open a new tab.

## One Terminal Per Worktree

**The mental model: one terminal = one worktree.** Do not re-source `env.sh` from a
different worktree in the same terminal session.

When you `source env.sh`, `GLAZE_ROOT` is set to that directory. All server state — PID
files, port assignments, logs — is scoped under `$GLAZE_ROOT/.dev-pids/` and
`.dev-logs/`. Re-sourcing from a different worktree orphans any running servers with no
clean kill path.

## Running Servers (for suggesting to users, not for agents to start themselves)

Agents should not start servers autonomously. When suggesting server startup to users:

```bash
gz_start          # starts Django + Vite, opens browser, registers EXIT cleanup trap
gz_stop           # stop servers in current worktree
gz_status         # see what's running and on which ports
```

Django picks the first free port at or above 8080; Vite picks first free at or above 5173.
Assigned ports are written to `.dev-pids/backend.port` and `.dev-pids/web.port`.
Two worktrees can run full dev stacks simultaneously without port conflicts.

`gz_start` registers a shell `EXIT` trap that calls `gz_stop` automatically when the
terminal tab closes (best-effort: fires on normal exits, not SIGKILL).

## Authenticating Against the Local Dev Server (dev login)

The dev server ships a **no-credential mock identity provider** so agents and humans
can sign in without Google OAuth. It is mounted only when `DEV_BOOTSTRAP_ENABLED` is
true — the default in dev (`DEBUG=True`), and **absent in production** (calls 403/404
there). The endpoints are `GET/POST /api/auth/mock-idp/authorize/` and
`GET /api/auth/mock-idp/complete/`.

**First login auto-provisions a usable account:** it creates a superuser for the
`login_hint` email and seeds ~75 sample pieces (`seed_dev_pieces`), so the account has
realistic data immediately — no fixture load or prod restore needed for most repros.
(For *real* prod data, use [`gz_backup` / `gz_restore`](#production-backup--local-repro-from-a-prod-snapshot).)

**Humans:** open the app (`gz_open`), and the dev sign-in page presents an Accept
button — no password.

**Agents (headless two-step curl flow):** the authorize endpoint is CSRF-exempt.
`redirect_uri` must be the **relative** path `/api/auth/mock-idp/complete/` (an absolute
`http://…` URL is rejected with 400). Do the two hops explicitly — a single `curl -L`
across the chain is unreliable because cookies written at the intermediate hop are not
flushed when the final hop returns a redirect.

```bash
BASE="http://localhost:$(cat .dev-pids/backend.port)"
JAR="$(mktemp)"

# 1. POST authorize → capture the (relative) redirect to complete/?code=…
LOCATION=$(curl -fsS -c "$JAR" -b "$JAR" -D - -X POST \
  --data "redirect_uri=/api/auth/mock-idp/complete/&state=x&login_hint=dev@localhost" \
  "${BASE}/api/auth/mock-idp/authorize/" \
  | grep -i '^location:' | sed 's/[Ll]ocation: //' | tr -d '\r\n')

# 2. GET complete/ → Django session cookie is written to the jar (302 → /)
curl -fsS -c "$JAR" -b "$JAR" "${BASE}${LOCATION}" -o /dev/null

# Verify: authenticated, with seeded pieces
curl -fsS -b "$JAR" "${BASE}/api/auth/me/" | python3 -m json.tool      # user is non-null
curl -fsS -b "$JAR" "${BASE}/api/pieces/" | python3 -c \
  "import json,sys; print('pieces:', json.load(sys.stdin)['count'])"   # > 0
```

`login_hint` selects/creates the account; omit it to default to `dev@localhost`. For
multi-user repros, repeat with a second cookie jar and a different `login_hint`.

## Orientation Inside a Worktree

In a git worktree, `.git` is a **file**, not a directory. To confirm which branch:

```bash
cat .git                    # shows: gitdir: /path/to/.git/worktrees/<name>
git branch --show-current   # shows the checked-out branch
```

`git checkout <branch>` fails with "already used by worktree" — this is the normal signal
that you're already on the right branch. Confirm with `git branch --show-current` and proceed.

Always run `git` commands from the repo root. Wrap subdirectory commands in a subshell:

```bash
# ✅ correct — shell stays at repo root
(cd web && pnpm install)
git add web/pnpm-lock.yaml

# ❌ incorrect — shell is now inside web/
cd web && pnpm install
git add web/pnpm-lock.yaml   # fails: no web/web/pnpm-lock.yaml
```

## Environment Variables

**`.env.example`** (repo root, committed) is the canonical reference for all variables.
Each entry has an inline comment explaining what it enables and what degrades when absent.
Read it directly when debugging a "why isn't this feature working in dev" question.
When a variable is added, removed, or renamed, update `.env.example`'s comment too.

**`.env.local`** (loaded by `source env.sh`, read by Django) — quick absent-behavior reference:

| Variable | Absent behavior |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | `/api/uploads/cloudinary/widget-config/` returns 503; UI falls back to URL-paste mode |
| `CLOUDINARY_API_KEY` | same as above |
| `CLOUDINARY_API_SECRET` | same as above |
| `CLOUDINARY_UPLOAD_FOLDER` | uploads go to root of Cloudinary account (optional) |
| `GOOGLE_OAUTH_CLIENT_ID` | `POST /api/auth/google/` non-functional; email/password login still works |

## Configuration Rationale

Understanding where config lives:

1. **GitHub Secrets / Variables**: Source of truth for environment-specific configuration. Includes sensitive secrets (passwords, API keys) and non-sensitive vars (service URLs, hostnames). Injected into `.env` at deploy time.
2. **`docker-compose.yml`**: Defines internal topology (e.g., `DATABASE_URL: postgres://db:5432`). Use this for constants that only depend on the Docker network.
3. **Backend runtime API**: Public frontend configuration (e.g. `GOOGLE_OAUTH_CLIENT_ID`) is served at runtime by the backend via `GET /api/auth/me/`. The frontend fetches this on load — no build-time injection or `.env` baking required.

## Off-Limits Paths

**Never** use `find`, `ls`, `Read`, `grep`, or any other tool to scan or read files
under `/home/phil/.cache/bazel`. It is large, slow to traverse, and not a source of
truth for anything in the repo. To inspect a Python package, read it from
`.manage.venv/lib/python3.12/site-packages/` instead.

## Copying `.env.local` into a Worktree

When working in an agent worktree, copy the untracked root `.env.local` into the
worktree so servers load Cloudinary and OAuth credentials:

```bash
cp /home/phil/code/glaze/.env.local .env.local
```

Do not symlink `.env.local`.

**Avoid copying `.env.local` from prod** — prod env files often contain keys set to
empty strings (e.g. `EMAIL_PORT=`) that are valid in shell but cause Django startup
errors (`invalid literal for int() with base 10: ''`). If you must copy, strip any
lines whose value is empty before using the file.

**`.env.example` uses commented-out `# VAR=` for variables without defaults.** Never
set a variable to an empty string in `.env.local` — omit it entirely or comment it
out. The same rule applies when adding new variables to `.env.example`: comment out
any entry that has no safe default value.

## Worktree Database Isolation

`gz_start` in a worktree automatically resolves the database to use:
- If a `db.sqlite3` exists in the main checkout and none exists in the worktree,
  the backend server shares the main checkout's database via `DATABASE_URL`.
- If a `db.sqlite3` exists in the worktree, that one is used.

This means a fresh worktree shares the main dev database by default, which is
usually what you want. To force a worktree-local database, run migrations first:

```bash
DATABASE_URL=sqlite:////absolute/path/to/worktree/db.sqlite3 \
  .manage.venv/bin/python manage.py migrate
```

Then restart `gz_start` — it will detect the new worktree db and use it.

**The `bazel run //:manage` command always uses the main checkout's database**
regardless of which worktree you're in (Bazel resolves `BASE_DIR` from its execroot).
Use `.manage.venv/bin/python manage.py` with an explicit `DATABASE_URL` for any
management command that must target a specific worktree database. See the backend
skill for the full pattern.

## Production Backup & Local Repro From a Prod Snapshot

When a bug only reproduces with realistic data (many pieces, real Cloudinary image
references — e.g. pagination or image-rendering bugs), **do not hand-roll a data import
or scrape the live API**. Use the `gz_backup` / `gz_restore` pair. Both are defined in
`env-agent.sh`.

```bash
# 1. Stream a prod Postgres dump locally and verify it in a throwaway
#    postgres:17 container. Requires GLAZE_PROD_HOST in .env.local, Tailscale
#    connectivity, and a running local Docker daemon. Prod is read-only here
#    (pg_dump -Fc inside glaze-postgres-0 over ssh + kubectl exec).
gz_backup                    # writes /tmp/glaze-prod-postgres-XXXXXX.dump, prints the path
gz_backup /tmp/prod.dump     # or pass an explicit path (refuses to overwrite)

# 2. Restore into LOCAL dev Postgres. If DATABASE_URL is already postgres://, it
#    restores there; otherwise it starts/reuses a Docker container `glaze-dev-db`
#    on localhost:5433 and prints the DATABASE_URL to add to .env.local.
gz_restore /tmp/prod.dump
```

| Command | Target | Safety |
|---|---|---|
| `gz_backup [file]` | prod (read-only `pg_dump`) | safe |
| `gz_restore <file>` | local dev Postgres | safe — never touches prod |
| `gz_restore --prod <file>` | **production Postgres** | **destructive & irreversible** — requires typing a random confirmation string; log successful runs in `docs/ops/restore-drill-log.md` |

Local dev historically used SQLite (`db.sqlite3`); the restore path targets Postgres, so a
`gz_restore` switches your local stack to a Postgres `DATABASE_URL`. Do not try to load a
`-Fc` Postgres dump into SQLite. Full implementations: `gz_backup` (`env-agent.sh` L412),
`gz_restore` (L474).
