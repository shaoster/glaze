# Lightweight env init for non-interactive agent shells (Claude Code, Cursor agent, etc.).
# Sourced automatically via BASH_ENV — keep it silent and fast.
# Do NOT source ~/.bashrc here; agents don't need interactive shell config.

if [[ -n "${GLAZE_ROOT:-}" ]]; then
    _GLAZE_SCRIPT_DIR="$GLAZE_ROOT"
else
    _GLAZE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

_gz_detect_git_root() {
    local cwd="${PWD:-$_GLAZE_SCRIPT_DIR}"
    git -C "$cwd" rev-parse --show-toplevel 2>/dev/null
}

_gz_detect_shared_root() {
    local git_root="$1"
    local common_dir
    common_dir="$(git -C "$git_root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
    cd "$common_dir/.." 2>/dev/null && pwd
}

_detected_root="$(_gz_detect_git_root)"
_detected_root="${_detected_root:-$_GLAZE_SCRIPT_DIR}"

# Guard against double-sourcing, but re-initialize if we're in a different
# git root than what was previously detected (e.g. switched into a worktree).
if [[ -z "$_GLAZE_AGENT_ENV_LOADED" || "${GLAZE_ROOT:-}" != "$_detected_root" ]]; then
    export _GLAZE_AGENT_ENV_LOADED=1
    export GLAZE_AGENT=1

    GLAZE_ROOT="$_detected_root"
    unset _detected_root
    GLAZE_SHARED_ROOT="$(_gz_detect_shared_root "$GLAZE_ROOT")"
    GLAZE_SHARED_ROOT="${GLAZE_SHARED_ROOT:-$GLAZE_ROOT}"
    export GLAZE_ROOT GLAZE_SHARED_ROOT

    _GLAZE_PIDS="$GLAZE_ROOT/.dev-pids"
    _GLAZE_LOGS="$GLAZE_ROOT/.dev-logs"
    mkdir -p "$_GLAZE_PIDS" "$_GLAZE_LOGS"

    _gz_prepend_path_once() {
        local dir="$1"
        [[ -d "$dir" ]] || return 0
        case ":${PATH:-}:" in
            *":$dir:"*) return 0 ;;
        esac
        PATH="$dir${PATH:+:$PATH}"
        export PATH
    }

    _gz_preferred_root_for() {
        printf '%s\n' "$GLAZE_ROOT"
    }

    # Activate Bazel-managed venv if present (built by `bazel run //:manage.venv`)
    _GLAZE_VENV_ROOT="$(_gz_preferred_root_for ".manage.venv/bin/activate")"
    [[ -f "$_GLAZE_VENV_ROOT/.manage.venv/bin/activate" ]] && source "$_GLAZE_VENV_ROOT/.manage.venv/bin/activate"

    # Load local env vars
    _gz_load_env_file() {
        local path="$1"
        [[ -f "$path" ]] || return 0
        set -a
        # shellcheck disable=SC1090
        source "$path"
        set +a
    }

    _gz_load_preferred_env_file() {
        local rel="$1"
        local preferred_root
        preferred_root="$(_gz_preferred_root_for "$rel")"
        _gz_load_env_file "$preferred_root/$rel"
    }

    _gz_load_preferred_env_file ".env.local"
    _gz_load_preferred_env_file "web/.env.local"

    _gz_bazel() {
        if command -v rtk &>/dev/null; then
            rtk bazel "$@"
        else
            bazel "$@"
        fi
    }

    _gz_manage_venv_looks_ready() {
        [[ -f "$GLAZE_ROOT/.manage.venv/bin/activate" ]] || return 1
        [[ -L "$GLAZE_ROOT/.manage.venv" ]] || return 0
        local link_target
        link_target="$(readlink -f "$GLAZE_ROOT/.manage.venv" 2>/dev/null)" || return 1
        [[ -n "$link_target" && -d "$link_target" ]]
    }

    _gz_resolved_db_path() {
        local db_url="${DATABASE_URL:-}"
        if [[ -z "$db_url" ]]; then
            printf '%s\n' "$GLAZE_ROOT/db.sqlite3"
            return 0
        fi
        if [[ "$db_url" != sqlite:* ]]; then
            return 1
        fi
        python3 - "$db_url" "$GLAZE_ROOT" <<'PY'
import os
import sys
from urllib.parse import unquote, urlparse

db_url = sys.argv[1]
root = sys.argv[2]
parsed = urlparse(db_url)
if parsed.scheme != "sqlite":
    raise SystemExit(1)
path = unquote(parsed.path or "")
if path.startswith("//"):
    path = path[1:]
if not path:
    raise SystemExit(1)
if path.startswith("/"):
    print(path)
else:
    print(os.path.abspath(os.path.join(root, path)))
PY
    }

    _gz_ensure_bootstrap() {
        if [[ -n "${BASH_ENV:-}" ]] && ! command -v rtk &>/dev/null; then
            echo "--- Installing RTK (for test optimizations and type generation)..."
            curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
            export PATH="$HOME/.local/bin:$PATH"
            mkdir -p ~/.claude
            rtk init -g --auto-patch
        fi

        if ! _gz_manage_venv_looks_ready; then
            if [[ -e "$GLAZE_ROOT/.manage.venv" || -L "$GLAZE_ROOT/.manage.venv" ]]; then
                rm -rf "$GLAZE_ROOT/.manage.venv"
            fi
            echo "--- Building Python venv with Bazel (//:manage.venv)..."
            (cd "$GLAZE_ROOT" && _gz_bazel run //:manage.venv)
        fi

        local db_path=""
        if db_path="$(_gz_resolved_db_path 2>/dev/null)"; then
            if [[ ! -e "$db_path" ]]; then
                echo "--- Running migrations..."
                (cd "$GLAZE_ROOT" && _gz_bazel run //:manage -- migrate --run-syncdb)
            fi
        fi

        [[ -f "$GLAZE_ROOT/.manage.venv/bin/activate" ]] && source "$GLAZE_ROOT/.manage.venv/bin/activate"
    }

    _gz_ensure_bootstrap

    _gz_prepend_path_once "$GLAZE_ROOT/web/node_modules/.bin"
    _gz_prepend_path_once "$GLAZE_ROOT/bin"

    # Prevent Rust/rtk stack overflows from crashing the WSL2 VM
    ulimit -s unlimited 2>/dev/null || true

    # Propagate to child processes so agents spawned from an interactive shell
    # (Codex, etc.) also get this bootstrap without per-tool config.
    export BASH_ENV="$_GLAZE_SCRIPT_DIR/env-agent.sh"
fi

unset _detected_root

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_gz_venv_root() {
    _gz_preferred_root_for ".manage.venv/bin/activate"
}

_gz_port_is_free() {  # _gz_port_is_free <port>
    local port="$1"
    python3 - "$port" <<'EOF'
import socket, sys
port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.settimeout(0.2)
    raise SystemExit(1 if s.connect_ex(("127.0.0.1", port)) == 0 else 0)
EOF
}

_gz_find_free_port() {  # _gz_find_free_port [start_port]  — returns first unbound port >= start
    local port="${1:-8080}"
    [[ "$port" =~ ^[0-9]+$ ]] || return 1
    (( port >= 0 && port <= 65535 )) || return 1
    while [[ "$port" -le 65535 ]]; do
        if _gz_port_is_free "$port"; then
            printf '%s\n' "$port"
            return 0
        fi
        (( port++ ))
    done
    return 1
}

_gz_is_running() {   # _gz_is_running <name>
    local pidfile="$_GLAZE_PIDS/$1.pid"
    [[ -f "$pidfile" ]] || return 1
    local pid
    pid=$(cat "$pidfile")
    [[ -n "$pid" ]] || return 1
    # Check if PID exists and is not a zombie
    ps -p "$pid" -o state= 2>/dev/null | grep -qv "Z"
}

_gz_wait_for_health() {
    local port="$1"
    local url="http://127.0.0.1:$port/api/health/ready/"
    local i=0
    echo -n "Waiting for backend to be ready..."
    until curl -s "$url" | python3 -c 'import json, sys; print("ready" if json.load(sys.stdin).get("status") == "ready" else "not_ready")' 2>/dev/null | grep -q '^ready$'; do
        echo -n "."
        sleep 0.5
        (( i++ ))
        if (( i >= 40 )); then
            echo " timed out!"
            return 1
        fi
    done
    echo " ready."
}

_gz_start() {        # _gz_start <name> <logfile> <cmd...>
    local name="$1" logfile="$2"; shift 2
    if _gz_is_running "$name"; then
        echo "$name: already running (PID $(cat "$_GLAZE_PIDS/$name.pid"))"
        return 0
    fi
    # Use direct backgrounding. monitor mode ensures a new process group.
    # We use a subshell to avoid affecting the main shell state.
    (
        set -m
        "$@" >> "$logfile" 2>&1 &
        echo $! > "$_GLAZE_PIDS/$name.pid"
    )
    # Wait a moment to ensure the PID file is written
    sleep 0.1
    local pid=$(cat "$_GLAZE_PIDS/$name.pid" 2>/dev/null)
    echo "$name: started (PID ${pid:-unknown}) — logs: $logfile"
}

_gz_stop() {         # _gz_stop <name>
    local pidfile="$_GLAZE_PIDS/$1.pid"
    if [[ -f "$pidfile" ]]; then
        local pid i
        pid=$(cat "$pidfile")
        echo "Stopping $1 (PID $pid)..."
        # Kill the entire process group so child processes don't get orphaned when
        # the bash wrapper shell exits (e.g. on Ctrl+C from gz_start)
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        for i in {1..10}; do
            kill -0 -- -"$pid" 2>/dev/null || break
            sleep 0.1
        done
        if kill -0 -- -"$pid" 2>/dev/null; then
            kill -KILL -- -"$pid" 2>/dev/null || true
        fi
        echo "$1: stopped"
    else
        echo "$1: not running"
    fi
    rm -f "$pidfile" "${pidfile%.pid}.port"
}

_gz_rotate_log() {  # _gz_rotate_log <name>
    local logfile="$_GLAZE_LOGS/$1.log"
    [[ -f "$logfile" ]] && mv "$logfile" "${logfile%.log}.$(date +%Y%m%dT%H%M%S).log"
}

_gz_remove_symlink_if_present() {  # _gz_remove_symlink_if_present <path>
    local path="$1"
    [[ -L "$path" ]] || return 1
    rm "$path"
    return 0
}

_gz_link_shared_dir_if_missing() {  # _gz_link_shared_dir_if_missing <relative_path>
    local rel="$1"
    local shared_path="$GLAZE_SHARED_ROOT/$rel"
    local local_path="$GLAZE_ROOT/$rel"
    [[ "$GLAZE_SHARED_ROOT" == "$GLAZE_ROOT" ]] && return 1
    [[ -e "$local_path" || ! -e "$shared_path" ]] && return 1
    mkdir -p "$(dirname "$local_path")"
    ln -s "$shared_path" "$local_path"
}

_gz_ensure_node() {
    if command -v node &>/dev/null; then
        return 0
    fi
    # Try loading nvm if installed but not active in this shell
    local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
    if [[ -f "$nvm_dir/nvm.sh" ]]; then
        source "$nvm_dir/nvm.sh"
        command -v node &>/dev/null && return 0
    fi
    # Install nvm then Node 20
    echo "Node not found — installing nvm and Node 20 (this may take a minute)..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    source "$NVM_DIR/nvm.sh"
    ${GLAZE_AGENT:+rtk }nvm install 20
    ${GLAZE_AGENT:+rtk }nvm use 20
}

gz_install_mcp_tools() {
    echo "=== Installing MCP tool dependencies ==="
    local tools=(jq curl git gh)
    local missing=()
    for tool in "${tools[@]}"; do
        command -v "$tool" &>/dev/null || missing+=("$tool")
    done
    if [[ ${#missing[@]} -eq 0 ]]; then
        echo "All MCP tools already installed: ${tools[*]}"
        return 0
    fi
    echo "Missing: ${missing[*]}"
    if command -v apt-get &>/dev/null; then
        sudo apt-get update -q && sudo apt-get install -y "${missing[@]}"
    elif command -v brew &>/dev/null; then
        brew install "${missing[@]}"
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y "${missing[@]}"
    else
        echo "No supported package manager found (apt-get, brew, dnf). Install manually: ${missing[*]}"
        return 1
    fi
    echo "=== MCP tools installed ==="
}

gz_sync() {
    echo "=== Glaze: syncing package manager state ==="
    echo "--- Syncing Python dependencies via uv..."
    uv sync

    echo "--- Syncing web dependencies via pnpm import..."
    (cd "$GLAZE_ROOT/web" && pnpm import)

    echo "--- Reloading shell bootstrap..."
    gz_reload

    echo "=== Sync complete ==="
}

# ---------------------------------------------------------------------------
# Django manage.py
# ---------------------------------------------------------------------------

gz_manage() {        # gz_manage <subcommand> [args…]
    (
        cd "$GLAZE_ROOT"
        ${GLAZE_AGENT:+rtk }bazel run //:manage -- "$@"
    )
}

gz_migrate()         { gz_manage migrate "$@"; }
gz_makemigrations()  { gz_manage makemigrations "$@"; }
gz_shell()           { gz_manage shell "$@"; }
gz_dbshell()         { gz_manage dbshell "$@"; }
gz_showmigrations()  { gz_manage showmigrations "$@"; }
gz_dump_public_library() { gz_manage dump_public_library "$@"; }
gz_load_public_library() { gz_manage load_public_library "$@"; }

_gz_prod_kube() {    # internal: "KUBECONFIG=... kubectl exec deployment/glaze-web -- ..."
    local host="${GLAZE_PROD_HOST:?Set GLAZE_PROD_HOST=user@host in .env.local}"
    local KC="KUBECONFIG=/etc/rancher/k3s/k3s.yaml"
    ssh "$host" "$KC kubectl exec deployment/glaze-web -- $*"
}

gz_prod() {          # gz_prod <manage.py subcommand> [args…]
    _gz_prod_kube "python manage.py $*"
}

gz_prod_shell() {    # gz_prod_shell [-c "cmd"]  — piping avoids SSH quoting issues
    local host="${GLAZE_PROD_HOST:?Set GLAZE_PROD_HOST=user@host in .env.local}"
    local KC="KUBECONFIG=/etc/rancher/k3s/k3s.yaml"
    if [[ "$1" == "-c" ]]; then
        echo "${2:?gz_prod_shell -c requires a command string}" \
            | ssh "$host" "$KC kubectl exec -i deployment/glaze-web -- python manage.py shell"
    else
        ssh "$host" "$KC kubectl exec -it deployment/glaze-web -- python manage.py shell $*"
    fi
}
gz_prod_dbshell()    { gz_prod dbshell "$@"; }

gz_backup() {
    # Stream a production Postgres dump locally, then restore it into a
    # disposable postgres:17 container to verify the dump is readable and
    # contains application data.
    local host="${GLAZE_PROD_HOST:?Set GLAZE_PROD_HOST=user@host in .env.local}"
    local KC="KUBECONFIG=/etc/rancher/k3s/k3s.yaml"
    local dump_path="${1:-}"
    if [[ -z "$dump_path" ]]; then
        dump_path="$(mktemp /tmp/glaze-prod-postgres-XXXXXX.dump)"
    elif [[ -e "$dump_path" ]]; then
        echo "gz_backup: refusing to overwrite existing file: $dump_path" >&2
        return 1
    fi

    command -v docker >/dev/null || {
        echo "gz_backup: docker is required locally" >&2
        return 1
    }
    docker info >/dev/null 2>&1 || {
        echo "gz_backup: docker daemon is not reachable locally" >&2
        return 1
    }

    echo "--- backing up production postgres from $host ---"
    ssh "$host" "$KC kubectl exec glaze-postgres-0 -- bash -c 'PGPASSWORD=\"\$POSTGRES_PASSWORD\" pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc'" > "$dump_path"
    sha256sum "$dump_path"
    ls -lh "$dump_path"

    echo "--- verifying dump in disposable postgres:17 container ---"
    (
        set -euo pipefail
        local cid
        cid=$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=glaze postgres:17)
        cleanup() {
            docker stop "$cid" >/dev/null 2>&1 || true
        }
        trap cleanup EXIT

        for _ in $(seq 1 30); do
            if docker exec "$cid" pg_isready -U postgres >/dev/null 2>&1; then
                break
            fi
            sleep 2
        done

        docker exec "$cid" pg_restore --version
        docker exec -i "$cid" pg_restore -U postgres -d glaze --no-owner --no-privileges < "$dump_path"

        local table_count piece_count user_count
        table_count=$(docker exec "$cid" psql -U postgres -d glaze -Atqc \
            "SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';")
        piece_count=$(docker exec "$cid" psql -U postgres -d glaze -Atqc \
            "SELECT COUNT(*) FROM api_piece;")
        user_count=$(docker exec "$cid" psql -U postgres -d glaze -Atqc \
            "SELECT COUNT(*) FROM auth_user;")
        echo "Backed up $piece_count pieces across $user_count users."
        echo "Verified restore: $table_count public tables, api_piece has $piece_count rows."
    )

    echo "Backup saved to $dump_path"
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

gz_test_common() {
    ${GLAZE_AGENT:+rtk }bazel test //tests:common_test "$@"
}

gz_test_backend() {
    ${GLAZE_AGENT:+rtk }bazel test //api:api_test "$@"
}

gz_test_web() {
    ${GLAZE_AGENT:+rtk }bazel test //web:web_test "$@"
}

gz_test() {
    local target="//..."
    local mode="auto"
    local coverage=false
    local usage="Usage: gz_test [--all|--affected|--coverage] [bazel args...]"

    # Parse our custom flags first
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --all)
                mode="all"
                shift
                ;;
            --affected)
                mode="affected"
                shift
                ;;
            --coverage)
                coverage=true
                shift
                ;;
            --help)
                echo "$usage"
                return 0
                ;;
            -*)
                # Stop parsing at first bazel flag
                break
                ;;
            *)
                # Treat as target override if no flag matched
                target="$1"
                shift
                mode="manual"
                break
                ;;
        esac
    done

    if [[ "$mode" == "auto" ]]; then
        # Default to affected if on a branch, otherwise all
        local current_branch
        current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
        if [[ "$current_branch" != "main" && "$current_branch" != "HEAD" ]]; then
            mode="affected"
        else
            mode="all"
        fi
    fi

    if [[ "$mode" == "affected" ]]; then
        local diff_base="main"
        # Handle cases where main is not available or we are on main
        if ! git rev-parse --verify "$diff_base" &>/dev/null; then
            diff_base="origin/main"
        fi

        if git rev-parse --verify "$diff_base" &>/dev/null; then
            local FILES
            FILES=$(git diff --name-only "$diff_base...HEAD" 2>/dev/null)
            if [[ -n "$FILES" ]]; then
                local EXISTING=""
                for f in $FILES; do [[ -f "$f" ]] && EXISTING="$EXISTING $f"; done
                if [[ -n "$EXISTING" ]]; then
                    echo "Determining affected tests (comparing with $diff_base)..."
                    # Filter existing files to only those Bazel knows about to avoid query errors (exit code 7)
                    local ALL_SOURCES
                    ALL_SOURCES=$(_gz_get_all_sources)
                    local BAZEL_FILES
                    BAZEL_FILES=$(echo "$EXISTING" | tr ' ' '\n' | grep -Fxf <(echo "$ALL_SOURCES"))
                    if [[ -n "$BAZEL_FILES" ]]; then
                        target=$(_gz_get_affected_targets 'kind(test, //...)' "$BAZEL_FILES")
                        if [[ -n "$target" ]]; then
                             target=$(echo "$target" | tr '\n' ' ')
                             echo "Testing $(echo "$target" | wc -w) affected target(s)."
                        else
                             echo "No tests affected by these changes. Use 'gz_test --all' if you want to run everything."
                             return 0
                        fi
                    else
                        echo "No Bazel-tracked code changes detected. Use 'gz_test --all' if you want to run everything."
                        return 0
                    fi
                else
                    echo "No code changes detected. Use 'gz_test --all' if you want to run everything."
                    return 0
                fi
            else
                echo "No differences from $diff_base. Running all tests."
                target="//..."
            fi
        else
             echo "Warning: Could not find base branch '$diff_base'. Running all tests."
             target="//..."
        fi
    fi

    if [ "$coverage" = true ]; then
        # Exclude lint targets from coverage (they don't produce coverage data and slow down the pass)
        local coverage_target
        echo "Determining coverage targets (excluding 'lint' tagged targets)..."
        coverage_target=$(${GLAZE_AGENT:+rtk }bazel query "tests(set($target)) except attr(tags, lint, //...)" 2>/dev/null | tr '\n' ' ')
        if [[ -z "$coverage_target" ]]; then
            echo "No coverage targets found."
            return 0
        fi
        echo "Running: ${GLAZE_AGENT:+rtk }bazel coverage --config=ci --combined_report=lcov $coverage_target"
        (cd "$GLAZE_ROOT" && ${GLAZE_AGENT:+rtk }bazel coverage --config=ci --combined_report=lcov $coverage_target "$@")
    else
        echo "Running: ${GLAZE_AGENT:+rtk }bazel test $target"
        (cd "$GLAZE_ROOT" && ${GLAZE_AGENT:+rtk }bazel test --test_output=errors $target "$@")
    fi
}

# CI-aligned: run ruff, eslint, tsc, and mypy via Bazel (same as CI).
gz_lint() {
    echo "Running: ${GLAZE_AGENT:+rtk }bazel build --config=lint //..."
    (cd "$GLAZE_ROOT" && ${GLAZE_AGENT:+rtk }bazel build --config=ci --config=lint //... "$@")
}

# Auto-fix: reformat Python files and apply ruff auto-fixes in one step.
gz_format() {
    (
        source "$(_gz_venv_root)/.manage.venv/bin/activate"
        cd "$GLAZE_ROOT"
        ruff format .
        ruff check --fix .
    )
}

_gz_build() {
    # Full production build via Bazel (CI-aligned).
    # Symlinks web/dist → bazel-bin/web/dist for easy inspection.
    ${GLAZE_AGENT:+rtk }bazel build //... || return $?
    local dist_src="$GLAZE_ROOT/bazel-bin/web/dist"
    local dist_link="$GLAZE_ROOT/web/dist"
    if [[ ! -L "$dist_link" && -e "$dist_link" ]]; then
        echo "gz_build: warning: $dist_link exists and is not a symlink; skipping link"
    else
        ln -sfn "$dist_src" "$dist_link"
        echo "gz_build: web/dist → $dist_src"
    fi
}

gz_push() {
    # Build and push the OCI image to ghcr.io/shaoster/glaze.
    # Usage: gz_push [--latest]
    # Always tags with the current commit SHA; pass --latest to also tag :latest.
    local sha
    sha=$(git -C "$GLAZE_ROOT" rev-parse HEAD) || return 1
    local tag_args=(--tag "$sha")
    [[ "${1:-}" == "--latest" ]] && tag_args+=(--tag latest)
    ${GLAZE_AGENT:+rtk }bazel run --stamp //:push -- "${tag_args[@]}"
}

gz_deploy() {
    # Push the current image and deploy it to the production droplet.
    # Usage: gz_deploy [--no-push]
    # Reads GLAZE_PROD_HOST from .env.local (e.g. GLAZE_PROD_HOST=user@host).
    local host="${GLAZE_PROD_HOST:?Set GLAZE_PROD_HOST=user@host in .env.local}"
    local sha
    sha=$(git -C "$GLAZE_ROOT" rev-parse HEAD) || return 1
    if [[ "${1:-}" != "--no-push" ]]; then
        gz_push || return $?
    fi
    "$GLAZE_ROOT/deploy.sh" "$host" "$sha"
}

# ---------------------------------------------------------------------------
# Servers
# ---------------------------------------------------------------------------

gz_story() {
    local port=${1:-6006}
    echo "Starting Storybook dev server on http://localhost:$port ..."
    (cd "$GLAZE_ROOT" && ${GLAZE_AGENT:+rtk }bazel run //web:storybook_dev -- dev --port "$port")
}

gz_open() {
    (
        # Give servers a moment to settle
        sleep 1
        local port
        port=$(cat "$_GLAZE_PIDS/web.port" 2>/dev/null || grep 'Local:' "$_GLAZE_LOGS/web.log" 2>/dev/null | tail -1 | grep -oE ':[0-9]+/' | tr -d ':/')
        local url="http://localhost:${port:-5173}"
        echo "Opening $url"
        if command -v wslview &>/dev/null; then
            wslview "$url"
        else
            xdg-open "$url" 2>/dev/null || true
        fi
    )
}

gz_start() {
    (
        cd "$GLAZE_ROOT"
        ${GLAZE_AGENT:+rtk }bazel run //tools:gz_start_launcher
    ) || return $?

    # Best-effort cleanup when this terminal tab closes normally (Ctrl-D / exit / tab X).
    # Does not fire on SIGKILL. Intentionally registered only after gz_start so that
    # terminals that never started servers are unaffected.
    trap 'gz_stop' EXIT
}

gz_stop() {
    _gz_stop backend
    _gz_stop web
}

gz_status() {
    for name in backend web; do
        if _gz_is_running "$name"; then
            local pid port
            pid=$(cat "$_GLAZE_PIDS/$name.pid")
            port=$(cat "$_GLAZE_PIDS/$name.port" 2>/dev/null)
            if [[ -n "$port" ]]; then
                echo "$name: running on :$port (PID $pid)"
            else
                echo "$name: running (PID $pid)"
            fi
        elif [[ -f "$_GLAZE_PIDS/$name.pid" ]]; then
            local pid=$(cat "$_GLAZE_PIDS/$name.pid" 2>/dev/null)
            echo "$name: died (stale PID file: ${pid:-empty})"
        else
            echo "$name: not running"
        fi
    done
}

gz_clean() {         # purge all PID and port files in current worktree
    echo "Cleaning server state in $GLAZE_ROOT..."
    rm -f "$_GLAZE_PIDS"/*.pid "$_GLAZE_PIDS"/*.port
}

_gz_worktrees_purge() {
    echo "=== Purging agent worktrees ==="
    local wt_path="" wt_branch=""
    while IFS= read -r line; do
        if [[ "$line" == worktree\ * ]]; then
            wt_path="${line#worktree }"
        elif [[ "$line" == branch\ * ]]; then
            wt_branch="${line#branch refs/heads/}"
        elif [[ -z "$line" && -n "$wt_path" ]]; then
            # Only target agent-managed worktrees
            if [[ "$wt_path" =~ \.agent-worktrees/ || "$wt_path" =~ \.claude/worktrees/ ]]; then
                local skip=0
                echo "Checking $wt_branch ($wt_path)..."

                # 1. Check for open PRs
                if command -v gh &>/dev/null; then
                    if gh pr list --head "$wt_branch" --json number --jq '.[].number' | grep -q .; then
                        echo "  [SKIP] Branch '$wt_branch' has an open PR."
                        skip=1
                    fi
                fi

                # 2. Check for unpushed changes
                if [[ $skip -eq 0 ]]; then
                    local upstream
                    upstream=$(git -C "$GLAZE_SHARED_ROOT" rev-parse --abbrev-ref "$wt_branch@{u}" 2>/dev/null) || upstream=""
                    if [[ -n "$upstream" ]]; then
                        if [[ -n $(git -C "$GLAZE_SHARED_ROOT" rev-list "$upstream..$wt_branch") ]]; then
                            echo "  [SKIP] Branch '$wt_branch' has unpushed commits."
                            skip=1
                        fi
                    else
                         # No upstream, check if it's merged into main
                         if ! git -C "$GLAZE_SHARED_ROOT" merge-base --is-ancestor "$wt_branch" main 2>/dev/null; then
                             echo "  [SKIP] Branch '$wt_branch' has no upstream and is not merged into main."
                             skip=1
                         fi
                    fi
                fi

                if [[ $skip -eq 0 ]]; then
                    echo "  Removing..."
                    # Stop servers if running
                    (cd "$wt_path" && source env.sh && gz_stop >/dev/null 2>&1)
                    git -C "$GLAZE_SHARED_ROOT" worktree remove --force "$wt_path"
                fi
            fi
            wt_path="" wt_branch=""
        fi
    done < <(git -C "$GLAZE_SHARED_ROOT" worktree list --porcelain; echo)

    # Cleanup empty parent dirs
    [[ -d "$GLAZE_SHARED_ROOT/.agent-worktrees" ]] && find "$GLAZE_SHARED_ROOT/.agent-worktrees" -type d -empty -delete 2>/dev/null
    [[ -d "$GLAZE_SHARED_ROOT/.claude/worktrees" ]] && find "$GLAZE_SHARED_ROOT/.claude/worktrees" -type d -empty -delete 2>/dev/null
    echo "=== Purge complete ==="
}

gz_worktrees() {   # list or purge worktrees
    if [[ "${1:-}" == "--purge" ]]; then
        _gz_worktrees_purge
        return 0
    fi

    local pr_branches=""
    if command -v gh &>/dev/null; then
        # Cache open PR branches to avoid N network calls
        pr_branches=$(gh pr list --limit 100 --json headRefName --jq '.[].headRefName' 2>/dev/null)
    fi

    local wt_path="" wt_branch=""
    while IFS= read -r line; do
        if [[ "$line" == worktree\ * ]]; then
            wt_path="${line#worktree }"
        elif [[ "$line" == branch\ * ]]; then
            wt_branch="${line#branch refs/heads/}"
        elif [[ "$line" == HEAD\ * ]]; then
            wt_branch="(detached)"
        elif [[ -z "$line" && -n "$wt_path" ]]; then
            local indicators=()

            # 1. Running check
            if [[ -f "$wt_path/.dev-pids/backend.pid" || -f "$wt_path/.dev-pids/web.pid" ]]; then
                indicators+=("●")
            fi

            if [[ "$wt_branch" != "(detached)" ]]; then
                # 2. PR check
                if echo "$pr_branches" | grep -qFx "$wt_branch"; then
                    indicators+=("PR")
                fi

                # 3. Unpushed check
                local upstream
                upstream=$(git -C "$GLAZE_SHARED_ROOT" rev-parse --abbrev-ref "$wt_branch@{u}" 2>/dev/null) || upstream=""
                if [[ -n "$upstream" ]]; then
                    if [[ -n $(git -C "$GLAZE_SHARED_ROOT" rev-list "$upstream..$wt_branch") ]]; then
                        indicators+=("↑")
                    fi
                elif ! git -C "$GLAZE_SHARED_ROOT" merge-base --is-ancestor "$wt_branch" main 2>/dev/null; then
                    # No upstream, check if it's merged into main
                    indicators+=("↑")
                fi
            fi

            local ind_str=""
            if [[ ${#indicators[@]} -gt 0 ]]; then
                # Join with spaces
                ind_str=" $(IFS=" "; echo "${indicators[*]}")"
            fi

            printf "  %-50s  %s%s\n" "${wt_branch:-?}" "$wt_path" "$ind_str"
            wt_path="" wt_branch=""
        fi
    done < <(git -C "$GLAZE_SHARED_ROOT" worktree list --porcelain; echo)
}

gz_cd() {   # gz_cd [pattern] — cd to a matching worktree (defaults to root) and re-source env.sh
    local pattern="${1:-/}"

    # Shortcut for repo root
    if [[ "$pattern" == "/" || "$pattern" == "root" ]]; then
        local target="$GLAZE_SHARED_ROOT"
        echo "→ $target"
        cd "$target" && source "$target/env.sh"
        return
    fi

    if _gz_is_running backend || _gz_is_running web; then
        echo "Servers are running in this terminal — run 'gz_stop' before switching worktrees,"
        echo "or open a new terminal tab for the target worktree."
        return 1
    fi
    local matches
    matches=$(git -C "$GLAZE_SHARED_ROOT" worktree list --porcelain \
        | grep '^worktree ' | cut -d' ' -f2- | grep -i "$pattern" || true)
    local count
    if [[ -z "$matches" ]]; then
        count=0
    else
        count=$(echo "$matches" | grep -c '^')
    fi
    if [[ $count -eq 0 ]]; then
        echo "No worktree matching '$pattern'"
        gz_worktrees
        return 1
    elif [[ $count -gt 1 ]]; then
        echo "Ambiguous — multiple matches for '$pattern':"
        echo "$matches" | sed 's/^/  /'
        return 1
    fi
    local target="$matches"
    echo "→ $target"
    cd "$target" && source "$target/env.sh"
}

gz_logs() {    # gz_logs [backend|web|all]  — defaults to running servers
    local target="${1:-running}"
    local logs=()
    case "$target" in
        backend|web)
            if _gz_is_running "$target"; then
                logs+=("$_GLAZE_LOGS/$target.log")
            else
                echo "$target: not running"
                return 1
            fi
            ;;
        all)
            logs=("$_GLAZE_LOGS/backend.log" "$_GLAZE_LOGS/web.log")
            ;;
        running)
            _gz_is_running backend && logs+=("$_GLAZE_LOGS/backend.log")
            _gz_is_running web && logs+=("$_GLAZE_LOGS/web.log")
            ;;
        *)
            echo "Usage: gz_logs [backend|web|all]"
            return 2
            ;;
    esac
    if [[ ${#logs[@]} -eq 0 ]]; then
        echo "No servers running in $GLAZE_ROOT"
        return 1
    fi
    tail -f "${logs[@]}"
}

# ---------------------------------------------------------------------------
# Type generation
# ---------------------------------------------------------------------------

gz_reload() {
    # Re-source the interactive bootstrap so env/bootstrap edits take effect in
    # the current shell.
    unset _GLAZE_AGENT_ENV_LOADED
    # shellcheck disable=SC1091
    source "$_GLAZE_SCRIPT_DIR/env.sh"
}

gz_gentypes() {
    # Regenerate generated-types.ts via Bazel, then symlink it into the source
    # tree so the IDE and Vite dev server pick it up without a full build.
    ${GLAZE_AGENT:+rtk }bazel build //web:generated_types || return $?
    local src="$GLAZE_ROOT/bazel-bin/web/src/util/generated-types.ts"
    local dest="$GLAZE_ROOT/web/src/util/generated-types.ts"
    ln -sfn "$src" "$dest"
    echo "Generated: $dest → $src"
}

_GZ_SHORTCUTS=(
    "gz_help           — show this list of shortcuts"
    "gz_reload         — re-source env.sh in the current shell (picks up env/bootstrap edits)"
    "gz_sync           — reconcile uv/npm package edits and reload the shell"
    "gz_install_mcp_tools — install MCP tool dependencies (jq, curl, git, gh)"
    "gz_manage <cmd>   — run any manage.py subcommand"
    "gz_migrate        — migrate"
    "gz_makemigrations — makemigrations"
    "gz_shell          — Django shell"
    "gz_dbshell        — database shell"
    "gz_showmigrations — showmigrations"
    "gz_dump_public_library — export public library fixture via dump_public_library"
    "gz_load_public_library — import public library fixture via load_public_library"
    "gz_prod <cmd>     — run any manage.py subcommand on production (requires GLAZE_PROD_HOST in .env.local)"
    "gz_prod_shell     — Django shell on production"
    "gz_prod_dbshell   — database shell on production"
    "gz_backup [file]  — back up prod Postgres and verify it in a disposable postgres:17 container"
    "gz_test           — run affected tests via Bazel (smart detection on branches; --all to run everything)"
    "gz_test_common    — run workflow schema/integrity tests (pytest tests/)"
    "gz_test_backend   — run Django API tests (pytest api/)"
    "gz_test_web       — run the web tests only"
    "gz_lint           — run affected linters via Bazel (smart detection on branches; --all to lint everything)"
    "gz_format         — auto-fix: ruff format + ruff check --fix (Python)"
    "gz_gentypes       — regenerate TypeScript types via Bazel; symlinks into src/"
    "gz_push [--latest]— build + push OCI image tagged with HEAD sha (and :latest)"
    "gz_deploy [--no-push] — push image + deploy to GLAZE_PROD_HOST droplet"
    "gz_story [port]   — start Storybook dev server via Bazel (default port 6006)"
    "gz_start/stop     — start or stop backend + web (gz_start opens browser, registers EXIT cleanup)"
    "gz_open           — open the web UI in the browser (if servers already running)"
    "gz_status         — show what services are running (with ports)"
    "gz_worktrees [--purge] — list all worktrees (●:running, ↑:unpushed, PR:open-pr) or purge safe agent ones"
    "gz_cd [pattern]   — cd to a matching worktree (defaults to root) and re-source env.sh"
    "gz_logs [backend|web|all] — stream logs for running servers (or a selected service)"
)

gz_help() {
    echo "Glaze helper shortcuts:"
    for entry in "${_GZ_SHORTCUTS[@]}"; do
        echo "  $entry"
    done
}

# ---------------------------------------------------------------------------
# Completions
# ---------------------------------------------------------------------------

# Tab-complete gz_cd with branch slugs and path basenames from all worktrees.
# Generates candidates from both the short branch name (e.g. issue-123-fix-foo)
# and the directory basename (same thing for our naming convention, but useful
# when the branch name differs from the directory name).
_gz_cd_complete() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    local candidates
    candidates=$(git -C "$GLAZE_SHARED_ROOT" worktree list --porcelain 2>/dev/null \
        | awk '
            /^worktree / { path = substr($0, 10); n = split(path, a, "/"); basename = a[n] }
            /^branch /   { branch = substr($0, 8); gsub("refs/heads/", "", branch) }
            /^$/         { if (path) { print basename; if (branch != "" && branch != basename) print branch }; path=""; branch="" }
        ')
    candidates="root / $candidates"
    # shellcheck disable=SC2207
    COMPREPLY=( $(compgen -W "$candidates" -- "$cur") )
}
# complete -F is bash-only; skip in zsh to avoid spurious errors
[[ -n "${BASH_VERSION:-}" ]] && complete -F _gz_cd_complete gz_cd

_gz_get_all_sources() {
    local profile="$PWD/bazel_query_profile.json"
    echo "DEBUG: Starting ALL_SOURCES query at $(date +%s)"
    local sources
    sources=$(${GLAZE_AGENT:+rtk }bazel query --profile="$profile" --output=label 'kind("source file", //...:* )' 2> >(tee -a /dev/stderr) | sed 's|^//||; s|:|/|')
    echo "DEBUG: Finished ALL_SOURCES query at $(date +%s). Sources found: $(echo "$sources" | wc -l)"
    echo "$sources"
}

_gz_get_affected_targets() {
    local filter_query="$1"
    local bazel_files="$2"
    
    # 1. Get all potential targets matching the filter
    local all_candidates
    all_candidates=$(${GLAZE_AGENT:+rtk }bazel query "$filter_query" 2>/dev/null)
    
    # 2. Find targets that depend on the changed files, intersected with our candidates
    ${GLAZE_AGENT:+rtk }bazel query "set($all_candidates) intersect rdeps(//..., set($bazel_files))" 2>/dev/null
}
