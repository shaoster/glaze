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

_gz_is_running() {   # _gz_is_running <name>
    local pidfile="$_GLAZE_PIDS/$1.pid"
    [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

_gz_start() {        # _gz_start <name> <logfile> <cmd...>
    local name="$1" logfile="$2"; shift 2
    if _gz_is_running "$name"; then
        echo "$name: already running (PID $(cat "$_GLAZE_PIDS/$name.pid"))"
        return 0
    fi
    "$@" >> "$logfile" 2>&1 &
    echo $! > "$_GLAZE_PIDS/$name.pid"
    echo "$name: started (PID $!) — logs: $logfile"
}

_gz_stop() {         # _gz_stop <name>
    local pidfile="$_GLAZE_PIDS/$1.pid"
    if _gz_is_running "$1"; then
        local pid
        pid=$(cat "$pidfile")
        # Kill the entire process group so child processes don't get orphaned when
        # the bash wrapper shell exits (e.g. on Ctrl+C from gz_start)
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null
        echo "$1: stopped"
    else
        echo "$1: not running"
    fi
    rm -f "$pidfile"
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
    (cd "$GLAZE_ROOT" && bazel test --test_output=errors //... "$@")
}

# CI-aligned: run ruff, eslint, tsc, and mypy via Bazel (same as CI).
gz_lint() {
    (cd "$GLAZE_ROOT" && bazel build --config=lint //...)
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
    local venv_root env_root
    venv_root="$(_gz_venv_root)"
    env_root="$(_gz_preferred_root_for ".env.local")"
    _gz_start backend "$_GLAZE_LOGS/backend.log" \
        bash -c "source '$venv_root/.venv/bin/activate' && cd '$GLAZE_ROOT' && set -a && [ -f '$env_root/.env.local' ] && source '$env_root/.env.local'; set +a && python manage.py load_public_library --skip-if-missing && python manage.py runserver 8080"
}

gz_web() {
    _gz_start web "$_GLAZE_LOGS/web.log" \
        bash -c "cd '$GLAZE_ROOT/web' && npm run dev"

    # Wait for Vite to print the chosen port (up to 10 s)
    local i=0
    until grep -q 'Local:' "$_GLAZE_LOGS/web.log" 2>/dev/null; do
        sleep 0.2
        (( i++ ))
        (( i >= 50 )) && break
    done
    local port
    port=$(grep 'Local:' "$_GLAZE_LOGS/web.log" | tail -1 | grep -oE ':[0-9]+/' | tr -d ':/')
    [[ -n "$port" ]] && echo "web: http://localhost:$port"
    export APP_ORIGIN="http://localhost:$port"
}

gz_start() {
    _gz_rotate_log web
    gz_web
    _gz_rotate_log backend
    gz_backend

    trap 'echo "Stopping..."; gz_stop; trap - INT TERM' INT TERM
    echo "Running — press Ctrl+C to stop."
    while _gz_is_running backend || _gz_is_running web; do
        sleep 1
    done
    trap - INT TERM
}

gz_stop() {
    _gz_stop backend
    _gz_stop web
}

gz_status() {
    for name in backend web; do
        if _gz_is_running "$name"; then
            echo "$name: running (PID $(cat "$_GLAZE_PIDS/$name.pid"))"
        else
            echo "$name: stopped"
        fi
    done
}

gz_logs() {    # gz_logs [backend|web]  — defaults to both
    case "${1:-all}" in
        backend)  tail -f "$_GLAZE_LOGS/backend.log" ;;
        web) tail -f "$_GLAZE_LOGS/web.log" ;;
        *)        tail -f "$_GLAZE_LOGS/backend.log" "$_GLAZE_LOGS/web.log" ;;
    esac
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
    "gz_test           — run all tests via Bazel (CI-aligned, shows errors only)"
    "gz_test_common    — run workflow schema/integrity tests (pytest tests/)"
    "gz_test_backend   — run Django API tests (pytest api/)"
    "gz_test_web       — run the web tests only"
    "gz_lint           — run all linters via Bazel: ruff, eslint, tsc, mypy"
    "gz_format         — auto-fix: ruff format + ruff check --fix (Python)"
    "gz_build          — full production build via Bazel (//...); symlinks web/dist"
    "gz_gentypes       — regenerate TypeScript types via Bazel; symlinks into src/"
    "gz_push [--latest]— build + push OCI image tagged with HEAD sha (and :latest)"
    "gz_deploy [--no-push] — push image + deploy to GLAZE_PROD_HOST droplet"
    "gz_start/stop     — start or stop backend + web"
    "gz_status         — show what services are running"
    "gz_logs [backend|web] — stream backend and/or web logs"
)

gz_help() {
    echo "Glaze helper shortcuts:"
    for entry in "${_GZ_SHORTCUTS[@]}"; do
        echo "  $entry"
    done
}

# ---------------------------------------------------------------------------

echo "Glaze ready — run 'gz_help' for shortcuts, 'gz_setup' for first-time install."
