# syntax=docker/dockerfile:1
# Ubuntu 24.04 LTS (Noble Numbat).
# The typescript-node image has no noble variant, so we build on the
# official devcontainers Ubuntu base and install Node + TS tooling via nvm.
FROM mcr.microsoft.com/devcontainers/base:ubuntu
ARG USERNAME=dev
ARG NODE_VERSION=22



# The base image ships a non-root user called "vscode". Rename it.
RUN if [ "${USERNAME}" != "vscode" ]; then \
      groupmod --new-name "${USERNAME}" vscode && \
      usermod  --login    "${USERNAME}" \
               --home     "/home/${USERNAME}" \
               --move-home vscode && \
      if [ -f /etc/sudoers.d/vscode ]; then \
        mv /etc/sudoers.d/vscode "/etc/sudoers.d/${USERNAME}" && \
        sed -i "s/^vscode /${USERNAME} /" "/etc/sudoers.d/${USERNAME}"; \
      fi \
    ; fi

# Install tmux and curl (curl may already be present, but be explicit).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tmux curl \
    && rm -rf /var/lib/apt/lists/*

# Install astrovim for all users (needs root for apt-get, /opt, /etc/skel).
COPY setup-astrovim.sh /tmp/setup-astrovim.sh
RUN chmod +x /tmp/setup-astrovim.sh \
    && /tmp/setup-astrovim.sh \
    && rm /tmp/setup-astrovim.sh    

# Install nvm + Node + global TS tooling as the target user.
# NVM_DIR goes in the user's home so it survives container mounts correctly.
USER ${USERNAME}
ENV NVM_DIR=/home/${USERNAME}/.nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash \
    && . "${NVM_DIR}/nvm.sh" \
    && nvm install ${NODE_VERSION} \
    && nvm alias default ${NODE_VERSION} \
    && nvm use default \
    && npm install -g typescript ts-node eslint

# Keep the shell init wired up for interactive sessions.
RUN echo '. "${NVM_DIR}/nvm.sh"' >> /home/${USERNAME}/.bashrc \
    && echo '. "${NVM_DIR}/nvm.sh"' >> /home/${USERNAME}/.zshrc 2>/dev/null || true

# Wire up auto-cd to the devcontainer workspace and tmux auto-attach.
# On any interactive shell (VS Code terminal, SSH), automatically:
#   - cd into the project workspace in /workspaces/
#   - attach to (or create) a persistent tmux session named "dev"
RUN cat >> /home/${USERNAME}/.bashrc << 'SHELL_EOF'

# Auto-cd to devcontainer workspace
if [ -d /workspaces ]; then
  ws="$(ls -d /workspaces/*/ 2>/dev/null | head -1)"
  [ -n "$ws" ] && [ "$PWD" = "$HOME" ] && cd "$ws"
fi

# Auto-attach tmux (interactive shells only, skip if already in tmux)
if command -v tmux &>/dev/null && [ -z "$TMUX" ] && [ -n "$PS1" ]; then
  tmux attach-session -t dev 2>/dev/null || tmux new-session -s dev
fi
SHELL_EOF

# Same for zsh (in case the user prefers it over bash)
RUN cat >> /home/${USERNAME}/.zshrc << 'SHELL_EOF'

# Auto-cd to devcontainer workspace
if [ -d /workspaces ]; then
  ws="$(ls -d /workspaces/*/ 2>/dev/null | head -1)"
  [ -n "$ws" ] && [ "$PWD" = "$HOME" ] && cd "$ws"
fi

# Auto-attach tmux (interactive shells only, skip if already in tmux)
if command -v tmux &>/dev/null && [ -z "$TMUX" ] && [ -n "$PS1" ]; then
  tmux attach-session -t dev 2>/dev/null || tmux new-session -s dev
fi
SHELL_EOF
