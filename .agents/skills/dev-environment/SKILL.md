---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: dev-environment
description: |
  Glaze dev environment setup: shell bootstrap (env.sh / env-agent.sh), VS Code
  terminal profile, Claude Code BASH_ENV, worktree navigation (gz_cd, gz_worktrees),
  one-terminal-per-worktree rule, and environment variables. Invoke when setting up
  a fresh environment, navigating worktrees, or suggesting how to run servers locally.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Glaze Development Environment

## Initial Setup

```bash
# Backend
bazel run @uv//:uv -- sync
bazel run @uv//:uv -- run python manage.py migrate

# Web (separate terminal)
cd web
bazel run @nodejs_linux_amd64//:npm -- install
```

In a new environment, always run `source env.sh && gz_setup` before doing anything else.
`gz_setup` reuses the main checkout's `.venv` and `web/node_modules` by default from a
repo-local worktree. Use `gz_setup --isolated` (or `GLAZE_SETUP_ISOLATED=1 gz_setup`)
when a branch needs its own dependency environment (changing Python or Node packages).

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
source env.sh && gz_setup
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
(cd web && bazel run @nodejs_linux_amd64//:npx -- pnpm install)
git add web/pnpm-lock.yaml

# ❌ incorrect — shell is now inside web/
cd web && bazel run @nodejs_linux_amd64//:npx -- pnpm install
git add web/pnpm-lock.yaml   # fails: no web/web/pnpm-lock.yaml
```

## Environment Variables

**`.env.local`** (loaded by `source env.sh`, read by Django):

| Variable | Absent behavior |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | `/api/uploads/cloudinary/widget-config/` returns 503; UI falls back to URL-paste mode |
| `CLOUDINARY_API_KEY` | same as above |
| `CLOUDINARY_API_SECRET` | same as above |
| `CLOUDINARY_UPLOAD_FOLDER` | uploads go to root of Cloudinary account (optional) |
| `GOOGLE_OAUTH_CLIENT_ID` | `POST /api/auth/google/` non-functional; email/password login still works |

**`web/.env.local`** (read by Vite):

| Variable | Absent behavior |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google Sign-In button not rendered; must match `GOOGLE_OAUTH_CLIENT_ID` |

## Symlinking `.env.local` into a Worktree

When working in an agent worktree, symlink the untracked root `.env.local` into the
worktree so servers load Cloudinary and OAuth credentials:

```bash
ln -s /home/phil/code/glaze/.env.local .env.local
ln -s /home/phil/code/glaze/web/.env.local web/.env.local
```
