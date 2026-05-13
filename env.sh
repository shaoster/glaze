# Glaze development helpers — source this file, don't run it directly.
# Usage: source env.sh
# Also used as bash --rcfile by VS Code terminal profiles.

# When used as --rcfile, ~/.bashrc is not loaded automatically — do it first.
[[ -f ~/.bashrc ]] && source ~/.bashrc

_GLAZE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Bootstrap: everything (helpers, venv, env vars) defined in env-agent.sh.
source "$_GLAZE_SCRIPT_DIR/env-agent.sh"

# If we're in an interactive shell OR CI, we're likely a developer/bot, not an agent.
# This unsets the rtk prefix for all tool invocations.
unset GLAZE_AGENT

echo "Glaze ready — run 'gz_help' for shortcuts, 'gz_setup' for first-time install."
