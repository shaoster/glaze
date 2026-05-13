# Lightweight env init for non-interactive agent shells (Claude Code, Cursor agent, etc.).
# Sourced automatically via BASH_ENV — keep it silent and fast.
# Do NOT source ~/.bashrc here; agents don't need interactive shell config.

_GLAZE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
if [[ -n "$_GLAZE_AGENT_ENV_LOADED" && "${GLAZE_ROOT:-}" == "$_detected_root" ]]; then
    unset _detected_root
    return
fi
export _GLAZE_AGENT_ENV_LOADED=1
export GLAZE_AGENT=1

GLAZE_ROOT="$_detected_root"
unset _detected_root
GLAZE_SHARED_ROOT="$(_gz_detect_shared_root "$GLAZE_ROOT")"
GLAZE_SHARED_ROOT="${GLAZE_SHARED_ROOT:-$GLAZE_ROOT}"
export GLAZE_ROOT GLAZE_SHARED_ROOT

_gz_preferred_root_for() {
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

# Activate venv if present
_GLAZE_VENV_ROOT="$(_gz_preferred_root_for ".venv/bin/activate")"
[[ -f "$_GLAZE_VENV_ROOT/.venv/bin/activate" ]] && source "$_GLAZE_VENV_ROOT/.venv/bin/activate"

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
_gz_load_preferred_env_file "mobile/.env.local"

# Prevent Rust/rtk stack overflows from crashing the WSL2 VM
ulimit -s unlimited 2>/dev/null || true

# Propagate to child processes so agents spawned from an interactive shell
# (Codex, etc.) also get this bootstrap without per-tool config.
export BASH_ENV="$_GLAZE_SCRIPT_DIR/env-agent.sh"
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
    # RTK
    if ! command -v rtk &>/dev/null; then
        echo "--- Installing RTK (for test optimizations and type generation)..."
        curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
        mkdir -p ~/.claude
        rtk init -g --auto-patch
    fi

    # Python
    echo "--- Syncing Python environment with uv..."
    ${GLAZE_AGENT:+rtk }bazel run @uv//:uv -- sync

    # Database
    echo "--- Running migrations..."
    ${GLAZE_AGENT:+rtk }bazel run @uv//:uv -- run python "$GLAZE_ROOT/manage.py" migrate --run-syncdb

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
    (cd "$GLAZE_ROOT/web" && ${GLAZE_AGENT:+rtk }bazel run @nodejs_linux_amd64//:npm -- install --silent)

    echo "=== Setup complete ==="
    echo "    Run 'gz_gentypes' to regenerate TypeScript types via Bazel (no backend)."
    echo "    Run 'gz_start' to start both servers."
}

# ---------------------------------------------------------------------------
# Django manage.py
# ---------------------------------------------------------------------------
gz_manage() {        # gz_manage <subcommand> [args…]
    (
        cd "$GLAZE_ROOT"
        ${GLAZE_AGENT:+rtk }bazel run @uv//:uv -- run python manage.py "$@"
    )
}

gz_migrate()         { gz_manage migrate "$@"; }
gz_makemigrations()  { gz_manage makemigrations "$@"; }
gz_shell()           { gz_manage shell "$@"; }
gz_dbshell()         { gz_manage dbshell "$@"; }
gz_showmigrations()  { gz_manage showmigrations "$@"; }
gz_dump_public_library() { gz_manage dump_public_library "$@"; }
gz_load_public_library() { gz_manage load_public_library "$@"; }
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
        coverage_target=$(${GLAZE_AGENT:+rtk }bazel query "($target) except attr(tags, lint, //...)" 2>/dev/null | tr '\n' ' ')
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
        source "$(_gz_venv_root)/.venv/bin/activate"
        cd "$GLAZE_ROOT"
        ruff format .
        ruff check --fix .
    )
}

gz_build() {
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
