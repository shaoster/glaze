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

# Propagate to child processes so agents spawned from an interactive shell
# (Codex, etc.) also get this bootstrap without per-tool config.
export BASH_ENV="$_GLAZE_SCRIPT_DIR/env-agent.sh"
