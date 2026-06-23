#!/usr/bin/env bash
# Runs once after the container image is built (postCreateCommand).
# Installs per-user tooling that lives in $HOME:
#   - oh-my-tmux  (gpakosz/.tmux)
#   - Fresh editor (getfresh.dev)
set -euo pipefail

echo ">>> Installing oh-my-tmux..."
cd ~
# Clone into ~/.tmux and wire up the config files.
git clone --single-branch --depth 1 https://github.com/gpakosz/.tmux.git ~/.tmux
ln -s -f ~/.tmux/.tmux.conf ~/.tmux.conf
# .tmux.conf.local is the user-editable override file; copy only if not present
# so re-runs (e.g. rebuild without full image rebuild) don't clobber tweaks.
[ -f ~/.tmux.conf.local ] || cp ~/.tmux/.tmux.conf.local ~/.tmux.conf.local
echo "    oh-my-tmux installed."

echo ">>> Installing Fresh editor..."
# One-liner from https://getfresh.dev — downloads and places the binary on PATH.
curl -fsSL https://raw.githubusercontent.com/sinelaw/fresh/refs/heads/master/scripts/install.sh | sh
echo "    Fresh installed."

echo ">>> post-create complete."
