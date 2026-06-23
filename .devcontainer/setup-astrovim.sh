#!/usr/bin/env bash
#
# setup-astronvim.sh
#
# Installs Neovim + supporting tools (tree-sitter, ripgrep, lazygit, bottom)
# system-wide, and provisions an AstroNvim config (with custom keymaps,
# line-wrap settings, and the render-markdown plugin) for every user on
# the machine — including any user created after this script runs.
#
# Intended to be run once (as root, or via sudo) when a container starts.
#
# Env vars:
#   OVERWRITE_EXISTING_CONFIGS=true   Force-replace a user's existing
#                                     ~/.config/nvim (default: skip it,
#                                     so reruns on container restart don't
#                                     stomp on user customizations).

set -euo pipefail

OVERWRITE_EXISTING_CONFIGS="${OVERWRITE_EXISTING_CONFIGS:-false}"

echo "==> Installing base dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl unzip git ca-certificates
apt install -y build-essential

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ---------------------------------------------------------------------------
# 1. Neovim binary (system-wide, /opt)
# ---------------------------------------------------------------------------
echo "==> Installing Neovim"
NVIM_DIR=/opt/nvim-linux-x86_64
curl -L -o "$TMP_DIR/nvim-linux-x86_64.tar.gz" \
  https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.tar.gz
rm -rf "$NVIM_DIR"
tar -C /opt -xzf "$TMP_DIR/nvim-linux-x86_64.tar.gz"

# Available to every login shell, for every user (present and future)
tee /etc/profile.d/nvim-path.sh > /dev/null << 'EOF'
export PATH="$PATH:/opt/nvim-linux-x86_64/bin"
EOF
chmod +x /etc/profile.d/nvim-path.sh

# ---------------------------------------------------------------------------
# 2. tree-sitter CLI
# ---------------------------------------------------------------------------
echo "==> Installing tree-sitter CLI"
TS_VERSION="v0.26.9"
curl -L -o "$TMP_DIR/tree-sitter-cli-linux-x64.zip" \
  "https://github.com/tree-sitter/tree-sitter/releases/download/${TS_VERSION}/tree-sitter-cli-linux-x64.zip"
unzip -oq "$TMP_DIR/tree-sitter-cli-linux-x64.zip" -d "$TMP_DIR"
chmod +x "$TMP_DIR/tree-sitter"
mv "$TMP_DIR/tree-sitter" /usr/local/bin/tree-sitter
tree-sitter --version

# ---------------------------------------------------------------------------
# 3. ripgrep / lazygit / bottom
# ---------------------------------------------------------------------------
echo "==> Installing ripgrep, lazygit, bottom"
apt-get install -y ripgrep 

BOTTOM_VERSION="0.12.3"
curl -L -o "$TMP_DIR/bottom.deb" \
  "https://github.com/ClementTsang/bottom/releases/download/${BOTTOM_VERSION}/bottom_${BOTTOM_VERSION}-1_amd64.deb"
apt-get install -y "$TMP_DIR/bottom.deb"

LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po '"tag_name": "v\K[0-9.]+')
curl -Lo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz"
tar xf lazygit.tar.gz -C /usr/local/bin lazygit

# ---------------------------------------------------------------------------
# 4. Build a single AstroNvim "template" config
#    Placing it in /etc/skel means useradd -m will auto-provision it for
#    any user created after this script runs, for free.
# ---------------------------------------------------------------------------
echo "==> Building AstroNvim template config"
TEMPLATE_DIR=/etc/skel/.config/nvim

mkdir -p /etc/skel/.config
rm -rf "$TEMPLATE_DIR"
git clone --depth 1 https://github.com/AstroNvim/template "$TEMPLATE_DIR"
rm -rf "$TEMPLATE_DIR/.git"

tee -a "$TEMPLATE_DIR/init.lua" > /dev/null << 'EOF'

vim.keymap.set("n", "<up>", "gk", { desc = "Move cursor up one visual line" })
vim.keymap.set("n", "<down>", "gj", { desc = "Move cursor down one visual line" })
vim.keymap.set("i", "<up>", "<C-o>gk", { desc = "Move cursor up one visual line (insert)" })
vim.keymap.set("i", "<down>", "<C-o>gj", { desc = "Move cursor down one visual line (insert)" })
vim.keymap.set("v", "<up>", "gk", { desc = "Move cursor up one visual line (visual)" })
vim.keymap.set("v", "<down>", "gj", { desc = "Move cursor down one visual line (visual)" })

vim.opt.wrap = true          -- Enable line wrapping
vim.opt.linebreak = true     -- Wrap at word boundaries (not mid-word)
vim.opt.breakindent = true   -- Indent wrapped lines nicely
EOF

mkdir -p "$TEMPLATE_DIR/lua/plugins"
tee "$TEMPLATE_DIR/lua/plugins/render-markdown.lua" > /dev/null << 'EOF'
return {
  "MeanderingProgrammer/render-markdown.nvim",
  dependencies = { "nvim-treesitter/nvim-treesitter", "nvim-tree/nvim-web-devicons" },
  ft = { "markdown" },
  opts = {},
}
EOF

# Template should be world-readable so it can be copied for any user
chmod -R a+rX "$TEMPLATE_DIR"

# ---------------------------------------------------------------------------
# 5. Apply the config to every existing user on the machine (root + UID>=1000)
# ---------------------------------------------------------------------------
echo "==> Applying config to existing users"
while IFS=: read -r username _ uid gid _ home shell; do
  if [[ "$username" == "root" ]] || { [[ "$uid" -ge 1000 ]] && [[ "$uid" -lt 60000 ]]; }; then
    [[ -d "$home" ]] || continue

    if [[ -d "$home/.config/nvim" && "$OVERWRITE_EXISTING_CONFIGS" != "true" ]]; then
      echo "  - $username: nvim config already exists, skipping (set OVERWRITE_EXISTING_CONFIGS=true to replace)"
      continue
    fi

    mkdir -p "$home/.config"
    rm -rf "$home/.config/nvim"
    cp -r "$TEMPLATE_DIR" "$home/.config/nvim"
    chown -R "$username":"$gid" "$home/.config/nvim"
    echo "  - $username: configured ($home/.config/nvim)"
  fi
done < /etc/passwd

echo "==> Done. New shells will have nvim on PATH; new users get AstroNvim automatically via /etc/skel."
