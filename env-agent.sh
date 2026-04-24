# Lightweight env init for non-interactive agent shells (Claude Code, Cursor agent, etc.).
# Sourced automatically via BASH_ENV — keep it silent and fast.
# Do NOT source ~/.bashrc here; agents don't need interactive shell config.

# Guard against double-sourcing
[[ -n "$_GLAZE_AGENT_ENV_LOADED" ]] && return
export _GLAZE_AGENT_ENV_LOADED=1

GLAZE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Activate venv if present
[[ -f "$GLAZE_ROOT/.venv/bin/activate" ]] && source "$GLAZE_ROOT/.venv/bin/activate"

# Load local env vars
_gz_load_env_file() {
    local path="$1"
    [[ -f "$path" ]] || return 0
    set -a
    # shellcheck disable=SC1090
    source "$path"
    set +a
}
_gz_load_env_file "$GLAZE_ROOT/.env.local"
_gz_load_env_file "$GLAZE_ROOT/web/.env.local"
_gz_load_env_file "$GLAZE_ROOT/mobile/.env.local"

# Propagate to child processes so agents spawned from an interactive shell
# (Codex, etc.) also get this bootstrap without per-tool config.
export BASH_ENV="$GLAZE_ROOT/env-agent.sh"
