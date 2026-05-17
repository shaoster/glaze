# Glaze VS Code zsh bootstrap.
# ZDOTDIR points zsh here, so a fresh integrated terminal loads the repo-owned
# startup path instead of a user dotfile.

_GLAZE_ZSHRC_PATH="${${(%):-%N}:A}"
GLAZE_ROOT="${_GLAZE_ZSHRC_PATH:h:h}"
source "$GLAZE_ROOT/env.sh"
