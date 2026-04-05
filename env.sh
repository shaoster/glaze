# Glaze development helpers — source this file, don't run it directly.
# Usage: source env.sh

GLAZE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
        kill "$(cat "$pidfile")" && echo "$1: stopped"
    else
        echo "$1: not running"
    fi
    rm -f "$pidfile"
}

_gz_rotate_log() {  # _gz_rotate_log <name>
    local logfile="$_GLAZE_LOGS/$1.log"
    [[ -f "$logfile" ]] && mv "$logfile" "${logfile%.log}.$(date +%Y%m%dT%H%M%S).log"
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
    nvm install 20
    nvm use 20
}

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

gz_setup() {
    echo "=== Glaze: setting up development environment ==="

    # Python venv
    if [[ ! -d "$GLAZE_ROOT/.venv" ]]; then
        echo "--- Creating virtual environment..."
        python3 -m venv "$GLAZE_ROOT/.venv"
    fi
    source "$GLAZE_ROOT/.venv/bin/activate"
    echo "--- Installing Python dependencies..."
    pip install -r "$GLAZE_ROOT/requirements-dev.txt" -q

    # Database
    echo "--- Running migrations..."
    python "$GLAZE_ROOT/manage.py" migrate --run-syncdb

    # Node + frontend deps
    _gz_ensure_node
    echo "--- Installing frontend dependencies..."
    (cd "$GLAZE_ROOT/frontend" && npm install --silent)

    echo "=== Setup complete ==="
    echo "    Run 'gz_gentypes' to regenerate TypeScript types (requires the backend)."
    echo "    Run 'gz_start' to start both servers."
}

# ---------------------------------------------------------------------------
# Django manage.py
# ---------------------------------------------------------------------------

gz_manage() {        # gz_manage <subcommand> [args…]
    (
        source "$GLAZE_ROOT/.venv/bin/activate"
        cd "$GLAZE_ROOT"
        python manage.py "$@"
    )
}

gz_migrate()         { gz_manage migrate "$@"; }
gz_makemigrations()  { gz_manage makemigrations "$@"; }
gz_shell()           { gz_manage shell "$@"; }
gz_dbshell()         { gz_manage dbshell "$@"; }
gz_showmigrations()  { gz_manage showmigrations "$@"; }

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

gz_test_common() {
    (
        source "$GLAZE_ROOT/.venv/bin/activate"
        cd "$GLAZE_ROOT"
        pytest tests/ "$@"
    )
}

gz_test_backend() {
    (
        source "$GLAZE_ROOT/.venv/bin/activate"
        cd "$GLAZE_ROOT"
        pytest api/ "$@"
    )
}

gz_test_frontend() {
    (cd "$GLAZE_ROOT/frontend" && npm test "$@")
}

gz_test() {
    local common_exit backend_exit frontend_exit
    gz_test_common & local common_pid=$!
    gz_test_backend & local backend_pid=$!
    gz_test_frontend & local frontend_pid=$!
    wait $common_pid;   common_exit=$?
    wait $backend_pid;  backend_exit=$?
    wait $frontend_pid; frontend_exit=$?
    return $(( common_exit | backend_exit | frontend_exit ))
}

# ---------------------------------------------------------------------------
# Servers
# ---------------------------------------------------------------------------

gz_backend() {
    _gz_start backend "$_GLAZE_LOGS/backend.log" \
        bash -c "source '$GLAZE_ROOT/.venv/bin/activate' && cd '$GLAZE_ROOT' && python manage.py runserver 8080"
}

gz_frontend() {
    _gz_start frontend "$_GLAZE_LOGS/frontend.log" \
        bash -c "cd '$GLAZE_ROOT/frontend' && npm run dev"

    # Wait for Vite to print the chosen port (up to 10 s)
    local i=0
    until grep -q 'Local:' "$_GLAZE_LOGS/frontend.log" 2>/dev/null; do
        sleep 0.2
        (( i++ ))
        (( i >= 50 )) && break
    done
    local port
    port=$(grep 'Local:' "$_GLAZE_LOGS/frontend.log" | tail -1 | grep -oE ':[0-9]+/' | tr -d ':/')
    [[ -n "$port" ]] && echo "frontend: http://localhost:$port"
}

gz_start() {
    _gz_rotate_log backend
    _gz_rotate_log frontend
    gz_backend
    gz_frontend

    local backend_pid frontend_pid
    backend_pid=$(cat "$_GLAZE_PIDS/backend.pid" 2>/dev/null)
    frontend_pid=$(cat "$_GLAZE_PIDS/frontend.pid" 2>/dev/null)

    trap 'echo "Stopping..."; _gz_stop backend; _gz_stop frontend; trap - INT TERM' INT TERM
    echo "Running — press Ctrl+C to stop."
    wait $backend_pid $frontend_pid 2>/dev/null
    trap - INT TERM
}

gz_stop() {
    _gz_stop backend
    _gz_stop frontend
}

gz_status() {
    for name in backend frontend; do
        if _gz_is_running "$name"; then
            echo "$name: running (PID $(cat "$_GLAZE_PIDS/$name.pid"))"
        else
            echo "$name: stopped"
        fi
    done
}

gz_logs() {    # gz_logs [backend|frontend]  — defaults to both
    case "${1:-all}" in
        backend)  tail -f "$_GLAZE_LOGS/backend.log" ;;
        frontend) tail -f "$_GLAZE_LOGS/frontend.log" ;;
        *)        tail -f "$_GLAZE_LOGS/backend.log" "$_GLAZE_LOGS/frontend.log" ;;
    esac
}

# ---------------------------------------------------------------------------
# Type generation
# ---------------------------------------------------------------------------

gz_gentypes() {
    local we_started=false

    if ! _gz_is_running backend; then
        gz_backend
        we_started=true
        echo "Waiting for backend on :8080..."
        local i=0
        until curl -sf http://localhost:8080/api/schema/ >/dev/null 2>&1; do
            sleep 1
            (( i++ ))
            if (( i >= 30 )); then
                echo "Backend did not become ready in time — check: gz_logs backend"
                $we_started && _gz_stop backend
                return 1
            fi
        done
    fi

    echo "Regenerating TypeScript types..."
    (cd "$GLAZE_ROOT/frontend" && npm run generate-types)
    local exit_code=$?

    $we_started && _gz_stop backend
    return $exit_code
}

_GZ_SHORTCUTS=(
    "gz_help           — show this list of shortcuts"
    "gz_setup          — first-time setup (venv, deps, migrations, node)"
    "gz_manage <cmd>   — run any manage.py subcommand"
    "gz_migrate        — migrate"
    "gz_makemigrations — makemigrations"
    "gz_shell          — Django shell"
    "gz_dbshell        — database shell"
    "gz_showmigrations — showmigrations"
    "gz_test           — run all test suites in parallel"
    "gz_test_common    — run workflow schema/integrity tests (pytest tests/)"
    "gz_test_backend   — run Django API tests (pytest api/)"
    "gz_test_frontend  — run the frontend tests only"
    "gz_gentypes       — regenerate frontend TypeScript types"
    "gz_start/stop     — start or stop backend + frontend"
    "gz_status         — show what services are running"
    "gz_logs [backend|frontend] — stream backend and/or frontend logs"
)

gz_help() {
    echo "Glaze helper shortcuts:"
    for entry in "${_GZ_SHORTCUTS[@]}"; do
        echo "  $entry"
    done
}

# ---------------------------------------------------------------------------

echo "Glaze dev helpers loaded."
for entry in "${_GZ_SHORTCUTS[@]}"; do
    echo "  $entry"
done
