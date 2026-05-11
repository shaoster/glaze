# Glaze development helpers — source this file, don't run it directly.
# Usage: source env.sh
# Also used as bash --rcfile by VS Code terminal profiles.

# When used as --rcfile, ~/.bashrc is not loaded automatically — do it first.
[[ -f ~/.bashrc ]] && source ~/.bashrc

_GLAZE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Bootstrap: venv activation, .env.local loading, BASH_ENV export.
# env-agent.sh is also the entry point for non-interactive agent subshells.
source "$_GLAZE_SCRIPT_DIR/env-agent.sh"
GLAZE_ROOT="${GLAZE_ROOT:-$_GLAZE_SCRIPT_DIR}"
GLAZE_SHARED_ROOT="${GLAZE_SHARED_ROOT:-$GLAZE_ROOT}"

_GLAZE_PIDS="$GLAZE_ROOT/.dev-pids"
_GLAZE_LOGS="$GLAZE_ROOT/.dev-logs"
mkdir -p "$_GLAZE_PIDS" "$_GLAZE_LOGS"

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_gz_find_free_port() {  # _gz_find_free_port [start_port]  — returns first unbound port >= start
    python3 - "${1:-8080}" <<'EOF'
import socket, sys
port = int(sys.argv[1])
while True:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        s.bind(("", port))
        s.close()
        print(port)
        break
    except OSError:
        port += 1
EOF
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

_gz_preferred_root_for() {  # _gz_preferred_root_for <relative_path>
    local rel="$1"
    if [[ -e "$GLAZE_ROOT/$rel" ]]; then
        printf '%s\n' "$GLAZE_ROOT"
        return 0
    fi
    if [[ "$GLAZE_SHARED_ROOT" != "$GLAZE_ROOT" && -e "$GLAZE_SHARED_ROOT/$rel" ]]; then
        printf '%s\n' "$GLAZE_SHARED_ROOT"
        return 0
    fi
    printf '%s\n' "$GLAZE_ROOT"
}

_gz_venv_root() {
    _gz_preferred_root_for ".venv/bin/activate"
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
    rtk nvm install 20
    rtk nvm use 20
}

_gz_load_env_file() {  # _gz_load_env_file <path>
    local path="$1"
    [[ -f "$path" ]] || return 0
    set -a
    # shellcheck disable=SC1090
    source "$path"
    set +a
}

_gz_load_local_env() {
    local root
    root="$(_gz_preferred_root_for ".env.local")"
    _gz_load_env_file "$root/.env.local"

    root="$(_gz_preferred_root_for "web/.env.local")"
    _gz_load_env_file "$root/web/.env.local"

    root="$(_gz_preferred_root_for "mobile/.env.local")"
    _gz_load_env_file "$root/mobile/.env.local"
}

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

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

gz_setup() {
    local setup_mode="shared"
    if [[ "${GLAZE_SETUP_ISOLATED:-0}" == "1" ]]; then
        setup_mode="isolated"
    fi

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --isolated)
                setup_mode="isolated"
                ;;
            --shared)
                setup_mode="shared"
                ;;
            *)
                echo "Usage: gz_setup [--shared|--isolated]"
                return 2
                ;;
        esac
        shift
    done

    echo "=== Glaze: setting up development environment ==="
    echo "--- Setup mode: $setup_mode"
    # RTK
    if ! command -v rtk &>/dev/null; then
        echo "--- Installing RTK (for test optimizations and type generation)..."
        curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
        rtk init -g --auto-patch
    fi

    # Python venv
    if [[ "$setup_mode" == "isolated" ]]; then
        if _gz_remove_symlink_if_present "$GLAZE_ROOT/.venv"; then
            echo "--- Replacing shared .venv symlink with an isolated worktree virtual environment"
        fi
        if [[ ! -f "$GLAZE_ROOT/.venv/bin/activate" ]]; then
            echo "--- Creating virtual environment..."
            rtk python3 -m venv "$GLAZE_ROOT/.venv"
        fi
        source "$GLAZE_ROOT/.venv/bin/activate"
        echo "--- Installing Python dependencies into the isolated worktree virtual environment..."
    else
        if [[ ! -f "$GLAZE_ROOT/.venv/bin/activate" ]]; then
            if _gz_link_shared_dir_if_missing ".venv"; then
                echo "--- Reusing shared virtual environment from $GLAZE_SHARED_ROOT/.venv"
            elif [[ -f "$GLAZE_SHARED_ROOT/.venv/bin/activate" && "$GLAZE_SHARED_ROOT" != "$GLAZE_ROOT" ]]; then
                echo "--- Reusing shared virtual environment from $GLAZE_SHARED_ROOT/.venv"
            else
                echo "--- Creating virtual environment..."
                rtk python3 -m venv "$GLAZE_ROOT/.venv"
            fi
        fi
        source "$(_gz_venv_root)/.venv/bin/activate"
        if [[ "$(_gz_venv_root)" == "$GLAZE_SHARED_ROOT" && "$GLAZE_SHARED_ROOT" != "$GLAZE_ROOT" ]]; then
            echo "--- Shared Python dependencies already available in $GLAZE_SHARED_ROOT/.venv"
        else
            echo "--- Installing Python dependencies..."
        fi
    fi
    rtk pip install -r "$GLAZE_ROOT/requirements-dev.txt" -q

    # Database
    echo "--- Running migrations..."
    rtk python3 "$GLAZE_ROOT/manage.py" migrate --run-syncdb

    # Node + web deps
    _gz_ensure_node
    if [[ "$setup_mode" == "isolated" ]]; then
        if _gz_remove_symlink_if_present "$GLAZE_ROOT/web/node_modules"; then
            echo "--- Replacing shared web/node_modules symlink with isolated worktree dependencies"
        fi
        echo "--- Installing web dependencies into the isolated worktree..."
    else
        if _gz_link_shared_dir_if_missing "web/node_modules"; then
            echo "--- Reusing shared web/node_modules from $GLAZE_SHARED_ROOT/web/node_modules"
        fi
        if [[ -d "$GLAZE_ROOT/web/node_modules" ]]; then
            echo "--- Web dependencies already available"
        else
            echo "--- Installing web dependencies..."
        fi
    fi
    (cd "$GLAZE_ROOT/web" && rtk npm install --silent)

    echo "=== Setup complete ==="
    echo "    Run 'gz_gentypes' to regenerate TypeScript types via Bazel (no backend)."
    echo "    Run 'gz_start' to start both servers."
}

# ---------------------------------------------------------------------------
# Django manage.py
# ---------------------------------------------------------------------------

gz_manage() {        # gz_manage <subcommand> [args…]
    (
        source "$(_gz_venv_root)/.venv/bin/activate"
        cd "$GLAZE_ROOT"
        python manage.py "$@"
    )
}

gz_migrate()         { gz_manage migrate "$@"; }
gz_makemigrations()  { gz_manage makemigrations "$@"; }
gz_shell()           { gz_manage shell "$@"; }
gz_dbshell()         { gz_manage dbshell "$@"; }
gz_showmigrations()  { gz_manage showmigrations "$@"; }
gz_dump_public_library() { gz_manage dump_public_library "$@"; }
gz_load_public_library() { gz_manage load_public_library "$@"; }

gz_prod() {          # gz_prod <manage.py subcommand> [args…]
    local host="${GLAZE_PROD_HOST:?Set GLAZE_PROD_HOST=user@host in .env.local}"
    ssh "$host" "cd ~/glaze && docker compose exec web python manage.py $*"
}

gz_prod_shell() {    # gz_prod_shell [-c "cmd"]  — piping avoids SSH quoting issues
    local host="${GLAZE_PROD_HOST:?Set GLAZE_PROD_HOST=user@host in .env.local}"
    if [[ "$1" == "-c" ]]; then
        echo "${2:?gz_prod_shell -c requires a command string}" \
            | ssh "$host" "cd ~/glaze && docker compose exec -T web python manage.py shell"
    else
        ssh "$host" "cd ~/glaze && docker compose exec web python manage.py shell $*"
    fi
}
gz_prod_dbshell()    { gz_prod dbshell "$@"; }

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

gz_test_common() {
    (
        source "$(_gz_venv_root)/.venv/bin/activate"
        cd "$GLAZE_ROOT"
        pytest tests/ "$@"
    )
}

gz_test_backend() {
    (
        source "$(_gz_venv_root)/.venv/bin/activate"
        cd "$GLAZE_ROOT"
        pytest api/ "$@"
    )
}

gz_test_web() {
    (cd "$GLAZE_ROOT/web" && npm test "$@")
}

gz_test() {
    local target="//..."
    local mode="auto"
    local usage="Usage: gz_test [--all|--affected] [bazel args...]"

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
                        target=$(_gz_get_affected_targets "test" "$BAZEL_FILES")
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
        echo "Running: bazel coverage --config=ci --combined_report=lcov $target"
        (cd "$GLAZE_ROOT" && bazel coverage --config=ci --combined_report=lcov $target "$@")
    else
        echo "Running: bazel test $target"
        (cd "$GLAZE_ROOT" && bazel test --test_output=errors $target "$@")
    fi
}

# CI-aligned: run ruff, eslint, tsc, and mypy via Bazel (same as CI).
gz_lint() {
    local target="//..."
    local mode="auto"
    local usage="Usage: gz_lint [--all|--affected] [bazel args...]"

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
                    echo "Determining affected lint targets (comparing with $diff_base)..."
                    # Filter existing files to only those Bazel knows about to avoid query errors (exit code 7)
                    local ALL_SOURCES
                    ALL_SOURCES=$(_gz_get_all_sources)
                    local BAZEL_FILES
                    BAZEL_FILES=$(echo "$EXISTING" | tr ' ' '\n' | grep -Fxf <(echo "$ALL_SOURCES"))
                    if [[ -n "$BAZEL_FILES" ]]; then
                        target=$(_gz_get_affected_targets ".*" "$BAZEL_FILES")
                        if [[ -n "$target" ]]; then
                             target=$(echo "$target" | tr '\n' ' ')
                             echo "Linting $(echo "$target" | wc -w) affected target(s)."
                        else
                             echo "No targets affected by these changes. Use 'gz_lint --all' if you want to lint everything."
                             return 0
                        fi
                    else
                        echo "No Bazel-tracked code changes detected. Use 'gz_lint --all' if you want to lint everything."
                        return 0
                    fi
                else
                    echo "No code changes detected. Use 'gz_lint --all' if you want to lint everything."
                    return 0
                fi
            else
                echo "No differences from $diff_base. Linting all targets."
                target="//..."
            fi
        else
             echo "Warning: Could not find base branch '$diff_base'. Linting all targets."
             target="//..."
        fi
    fi

    echo "Running: bazel build --config=lint $target"
    (cd "$GLAZE_ROOT" && bazel build --config=ci --config=lint $target "$@")
}

# Auto-fix: reformat Python files and apply ruff auto-fixes in one step.
gz_format() {
    (
        source "$(_gz_venv_root)/.venv/bin/activate"
        cd "$GLAZE_ROOT"
        ruff format .
        ruff check --fix .
    )
}

gz_build() {
    # Full production build via Bazel (CI-aligned).
    # Symlinks web/dist → bazel-bin/web/dist for easy inspection.
    rtk bazel build //... || return $?
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
    rtk bazel run --stamp //:push -- "${tag_args[@]}"
}

gz_deploy() {
    # Push the current image and deploy it to the production droplet.
    # Usage: gz_deploy [--no-push]
    # Reads GLAZE_PROD_HOST from .env.local (e.g. GLAZE_PROD_HOST=user@host).
    local host="${GLAZE_PROD_HOST:?Set GLAZE_PROD_HOST=user@host in .env.local}"
    local sha
    sha=$(git -C "$GLAZE_ROOT" rev-parse HEAD) || return 1
    if [[ "${1:-}" != "--no-push" ]]; then
        gz_push --latest || return $?
    fi
    "$GLAZE_ROOT/deploy.sh" "$host" "$sha"
}

# ---------------------------------------------------------------------------
# Servers
# ---------------------------------------------------------------------------

gz_backend() {
    local venv_root env_root port web_port app_origin
    venv_root="$(_gz_venv_root)"
    env_root="$(_gz_preferred_root_for ".env.local")"
    port=$(_gz_find_free_port 8080)
    web_port=$(cat "$_GLAZE_PIDS/web.port" 2>/dev/null || echo 5173)
    app_origin="http://localhost:$web_port"
    echo "$port" > "$_GLAZE_PIDS/backend.port"
    _gz_start backend "$_GLAZE_LOGS/backend.log" \
        bash -c "source '$venv_root/.venv/bin/activate' && cd '$GLAZE_ROOT' && set -a && [ -f '$env_root/.env.local' ] && source '$env_root/.env.local'; set +a && export APP_ORIGIN='$app_origin' && python manage.py load_public_library --skip-if-missing && uvicorn backend.asgi:application --host 127.0.0.1 --port $port --reload"
}

gz_web() {
    local backend_port port
    backend_port=$(cat "$_GLAZE_PIDS/backend.port" 2>/dev/null || echo 8080)
    port=$(cat "$_GLAZE_PIDS/web.port" 2>/dev/null || _gz_find_free_port 5173)
    echo "$port" > "$_GLAZE_PIDS/web.port"
    BACKEND_PORT="$backend_port" _gz_start web "$_GLAZE_LOGS/web.log" \
        bash -c "cd '$GLAZE_ROOT/web' && BACKEND_PORT=$backend_port npm run dev -- --port $port --strictPort"

    # Wait for Vite to print the chosen port (up to 10 s)
    local i=0
    until grep -q 'Local:' "$_GLAZE_LOGS/web.log" 2>/dev/null; do
        sleep 0.2
        (( i++ ))
        (( i >= 50 )) && break
    done
    port=$(grep 'Local:' "$_GLAZE_LOGS/web.log" | tail -1 | grep -oE ':[0-9]+/' | tr -d ':/')
    [[ -n "$port" ]] && echo "$port" > "$_GLAZE_PIDS/web.port"
    [[ -n "$port" ]] && echo "web: http://localhost:$port"
    export APP_ORIGIN="http://localhost:${port:-5173}"
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
    ) &
}

gz_start() {
    _gz_rotate_log backend
    _gz_find_free_port 5173 > "$_GLAZE_PIDS/web.port"
    gz_backend
    _gz_rotate_log web
    gz_web
    gz_open
    echo "Servers running — use 'gz_stop' to stop, 'gz_logs' to tail output."
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
            if [[ "$wt_path" =~ \.agent-worktrees/|\.claude/worktrees/ ]]; then
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
                    upstream=$(git -C "$GLAZE_SHARED_ROOT" rev-parse --abbrev-ref "$wt_branch@{u}" 2>/dev/null || echo "")
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
                upstream=$(git -C "$GLAZE_SHARED_ROOT" rev-parse --abbrev-ref "$wt_branch@{u}" 2>/dev/null || echo "")
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

gz_gentypes() {
    # Regenerate generated-types.ts via Bazel, then symlink it into the source
    # tree so the IDE and Vite dev server pick it up without a full build.
    rtk bazel build //web:generated_types || return $?
    local src="$GLAZE_ROOT/bazel-bin/web/src/util/generated-types.ts"
    local dest="$GLAZE_ROOT/web/src/util/generated-types.ts"
    ln -sfn "$src" "$dest"
    echo "Generated: $dest → $src"
}

_GZ_SHORTCUTS=(
    "gz_help           — show this list of shortcuts"
    "gz_install_mcp_tools — install MCP tool dependencies (jq, curl, git, gh)"
    "gz_setup [--isolated] — setup (shared reuse by default; --isolated for per-worktree deps)"
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
    "gz_test           — run affected tests via Bazel (smart detection on branches; --all to run everything)"
    "gz_test_common    — run workflow schema/integrity tests (pytest tests/)"
    "gz_test_backend   — run Django API tests (pytest api/)"
    "gz_test_web       — run the web tests only"
    "gz_lint           — run affected linters via Bazel (smart detection on branches; --all to lint everything)"
    "gz_format         — auto-fix: ruff format + ruff check --fix (Python)"
    "gz_build          — full production build via Bazel (//...); symlinks web/dist"
    "gz_gentypes       — regenerate TypeScript types via Bazel; symlinks into src/"
    "gz_push [--latest]— build + push OCI image tagged with HEAD sha (and :latest)"
    "gz_deploy [--no-push] — push image + deploy to GLAZE_PROD_HOST droplet"
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
complete -F _gz_cd_complete gz_cd

# ---------------------------------------------------------------------------

echo "Glaze ready — run 'gz_help' for shortcuts, 'gz_setup' for first-time install."
_gz_get_all_sources() {
    local profile="$PWD/bazel_query_profile.json"
    echo "DEBUG: Starting ALL_SOURCES query at $(date +%s)"
    local sources
    sources=$(bazel query --profile="$profile" --output=label 'kind("source file", //...:* )' 2> >(tee -a /dev/stderr) | sed 's|^//||; s|:|/|')
    echo "DEBUG: Finished ALL_SOURCES query at $(date +%s). Sources found: $(echo "$sources" | wc -l)"
    echo "$sources"
}

_gz_get_affected_targets() {
    local filter="$1"
    local bazel_files="$2"
    bazel query "kind($filter, rdeps(//..., set($bazel_files)))" 2>/dev/null
}
