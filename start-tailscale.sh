#!/usr/bin/env bash
# Runs on every container start (postStartCommand).
# 1. Starts tailscaled in the background (systemd is absent in containers).
# 2. Connects to the tailnet, advertising SSH + the vscode tag.
# 3. Uses PROJECT_NAME as the Tailscale hostname so the node is identifiable.
# 4. Ensures OpenSSH is running.
#
# Required env vars (injected via docker --env-file from .devcontainer/.env):
#   TAILSCALE_AUTHKEY  — a reusable / ephemeral auth key from the Tailscale console
#   PROJECT_NAME       — used as the Tailscale node hostname: vs-<PROJECT_NAME>
set -euo pipefail

# ── Validation ────────────────────────────────────────────────────────────────

if [[ -z "${TAILSCALE_AUTHKEY:-}" ]]; then
  echo "ERROR: TAILSCALE_AUTHKEY is not set. Create .devcontainer/.env from the example." >&2
  exit 1
fi

if [[ -z "${PROJECT_NAME:-}" ]]; then
  echo "ERROR: PROJECT_NAME is not set. Create .devcontainer/.env from the example." >&2
  exit 1
fi

# ── tailscaled daemon ─────────────────────────────────────────────────────────

if ! pgrep -x tailscaled > /dev/null 2>&1; then
  echo "Starting tailscaled..."
  sudo mkdir -p /var/run/tailscale /var/lib/tailscale
  sudo tailscaled \
    --state=/var/lib/tailscale/tailscaled.state \
    --socket=/var/run/tailscale/tailscaled.sock \
    >> /tmp/tailscaled.log 2>&1 &

  # Wait for the Unix socket to appear instead of sleeping a fixed amount.
  for i in $(seq 1 20); do
    [ -S /var/run/tailscale/tailscaled.sock ] && break
    sleep 0.5
  done

  if ! [ -S /var/run/tailscale/tailscaled.sock ]; then
    echo "ERROR: tailscaled socket did not appear in time. Check /tmp/tailscaled.log" >&2
    exit 1
  fi
else
  echo "tailscaled is already running."
fi

# ── tailscale up ─────────────────────────────────────────────────────────────
# --hostname uses PROJECT_NAME so the node shows up clearly in the admin console.
# The container's Docker hostname (set via runArgs in devcontainer.json) is kept
# separate; Tailscale uses --hostname, not /etc/hostname.

echo "Bringing Tailscale up as: vs-${PROJECT_NAME}"
sudo tailscale up \
  --authkey="${TAILSCALE_AUTHKEY}" \
  --ssh \
  --advertise-tags=tag:vscode,tag:container \
  --hostname="vs-${PROJECT_NAME}" \
  --accept-routes

echo "Tailscale up. Node address: $(tailscale ip -4 2>/dev/null || echo 'pending')"

# ── OpenSSH ───────────────────────────────────────────────────────────────────
# Installed by the sshd devcontainer feature.

sudo service ssh start 2>/dev/null || true
echo "OpenSSH started (or was already running)."
