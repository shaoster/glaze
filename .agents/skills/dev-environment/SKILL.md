---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: dev-environment
description: |
  Glaze dev environment setup: shell bootstrap (env.sh / env-agent.sh), VS Code
  terminal profile, Claude Code BASH_ENV, worktree navigation (gz_cd, gz_worktrees),
  one-terminal-per-worktree rule, environment variables, worktree database isolation
  (gz_start db resolution, bazel run //:manage footgun), and .env.local copy pitfalls.
  Invoke when setting up a fresh environment, navigating worktrees, suggesting how to
  run servers locally, or troubleshooting database/env-var mismatches in a worktree.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Glaze Development Environment

## Initial Setup

```bash
# Backend
rtk bazel run @uv//:uv -- sync
rtk bazel run @uv//:uv -- run python manage.py migrate

# Web (separate terminal)
cd web
rtk bazel run @nodejs_linux_amd64//:npm -- install
```

In a new environment, always run `source env.sh` before doing anything else.
The bootstrap lazily materializes the minimal local state needed for a healthy shell
and keeps the repo-local developer environment consistent across worktrees.

## Shell Bootstrap

| Script | Purpose |
|---|---|
| `env.sh` | Interactive shells: sources `~/.bashrc`, delegates to `env-agent.sh`, defines all `gz_*` helpers |
| `env-agent.sh` | Lightweight, silent bootstrap for non-interactive shells: activates `.venv` if present, loads `.env.local` vars, exports `BASH_ENV` |

`env.sh` sources `env-agent.sh` — venv activation and env-var loading logic live in one place.

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
(cd web && rtk bazel run @nodejs_linux_amd64//:npx -- pnpm install)
git add web/pnpm-lock.yaml

# ❌ incorrect — shell is now inside web/
cd web && rtk bazel run @nodejs_linux_amd64//:npx -- pnpm install
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
3. **Build-time Injection (`ci.yml`)**: Static frontend assets (Vite) cannot read server environment variables at runtime. Public vars like `GOOGLE_OAUTH_CLIENT_ID` must be baked into the JS bundle during the image build in CI.

## Off-Limits Paths

**Never** use `find`, `ls`, `Read`, `grep`, or any other tool to scan or read files
under `/home/phil/.cache/bazel`. It is large, slow to traverse, and not a source of
truth for anything in the repo. To inspect a Python package, read it from
`.manage.venv/lib/python3.12/site-packages/` instead.

## Symlinking `.env.local` into a Worktree

When working in an agent worktree, symlink the untracked root `.env.local` into the
worktree so servers load Cloudinary and OAuth credentials:

```bash
ln -s /home/phil/code/glaze/.env.local .env.local
ln -s /home/phil/code/glaze/web/.env.local web/.env.local
```

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
