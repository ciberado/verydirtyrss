# Tailscale Devcontainer Template

> **Source:** https://github.com/ciberado/devcontainer-template

A devcontainer template that turns any devcontainer into a first-class,
persistent node on your [Tailscale](https://tailscale.com) tailnet. Once the
container is running you can SSH into it from any device on your tailnet, keep
long-running work in a tmux session, and build Docker images inside the
container.

## Quick start

Add this template to your **existing project repository** using `git subtree`:

```bash
git subtree add --prefix=.devcontainer \
    https://github.com/ciberado/devcontainer-template.git \
    main --squash
```

Then create a `.env` file inside `.devcontainer/`:

```bash
cp .devcontainer/.env.example .devcontainer/.env
```

Edit `.devcontainer/.env` with your Tailscale auth key and project name:

```env
TAILSCALE_AUTHKEY=tskey-auth-xxxxxxxxxxxxxxxx
PROJECT_NAME=my-project
```

Then build and start the container with the `devcontainer` CLI:

```bash
devcontainer up --workspace-folder .
```

Once it's running, open a shell inside the container:

```bash
devcontainer exec --workspace-folder . bash
```

That's it — you're now inside the container, on your tailnet, in a tmux
session.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- The [`devcontainer` CLI](https://containers.dev/supporting) (`npm install -g @devcontainers/cli`)
- A [Tailscale](https://tailscale.com) account
- A [Tailscale auth key](https://login.tailscale.com/admin/settings/authkeys) (reusable or ephemeral)

## How it works

```
You ── devcontainer up ── Docker ── Ubuntu 24.04 ── tailscale up ── your tailnet
                                   │                │
                                   ├─ Node 22       ├─ SSH enabled
                                   ├─ tmux          ├─ hostname: vs-<PROJECT_NAME>
                                   ├─ Docker-in-Docker
                                   └─ OpenSSH server
```

The container joins your tailnet automatically on every start using the
pre-provisioned auth key from `.env`. The SSH server lets you connect from
anywhere on your tailnet:

```bash
ssh dev@vs-my-project
```

When you SSH in, you're automatically dropped into a tmux session called `dev`.
Detach with `Ctrl+B d`, close the connection, and reattach later — your work
survives.

## File structure

| File | Role |
|---|---|
| `Dockerfile` | Builds the image: Ubuntu 24.04, Node 22 (via nvm), TypeScript tooling, tmux. Renames the default user to `dev`. |
| `devcontainer.json` | Devcontainer orchestrator. Sets `runArgs` for Docker (hostname, env file, container name), loads features (Tailscale, GitHub CLI, Docker-in-Docker, OpenSSH), wires lifecycle hooks. |
| `start-tailscale.sh` | Runs on every container start. Starts `tailscaled`, authenticates to your tailnet with the auth key, enables SSH, advertises tags. |
| `post-create.sh` | Runs once after the image is built. Installs oh-my-tmux and the Fresh editor. |
| `README.md` | This file. |

### Shell init (baked into the Docker image)

Two behaviors are wired into `.bashrc` and `.zshrc` during the Docker build:

- **Auto-cd:** if the shell lands in `$HOME`, it automatically `cd`s into the
  workspace directory under `/workspaces/`. This matters when you SSH in.
- **Tmux auto-attach:** on any interactive shell (terminal or SSH),
  it attaches to a tmux session named `dev`, creating it if it doesn't exist.
  Already inside tmux? It skips.

## Updating the template

Pull the latest version from the template repo:

```bash
git subtree pull --prefix=.devcontainer \
    https://github.com/ciberado/devcontainer-template.git \
    main --squash
```

If you have local customizations inside `.devcontainer/`, commit them first.
The pull is a git merge — it handles conflicts normally. After the pull,
rebuild the container to pick up any image changes.

### What you need per project

Even after pulling, each project must have:

| Item | Created by | Notes |
|---|---|---|
| `.devcontainer/.env` | Manual (`cp .devcontainer/.env.example .devcontainer/.env`) | Per-project auth key + name. Gitignored. |
| `.devcontainer/.env.example` | `git subtree add` | Template reference. Commit to git. |
| `.devcontainer/` | `git subtree add` | The whole template. |

Everything else — `.gitignore` entries (`.env`, `.codewhale/`), the Tailscale
auth key, Docker container naming — comes from the template or your `.env`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TAILSCALE_AUTHKEY` | Yes | Tailscale auth key (reusable or ephemeral). Generate at [admin console](https://login.tailscale.com/admin/settings/authkeys). |
| `PROJECT_NAME` | Yes | Used for the Tailscale hostname: `vs-<PROJECT_NAME>`. Also influences the Docker container name. |

Docker reads these from `.env` via `--env-file` at container start — they are
not baked into the image.

## Docker container naming

The container is created with `--name vs-<workspace-basename>` (e.g.,
`vs-my-project`). This makes `docker ps` output predictable and lets you run
commands like:

```bash
docker exec vs-my-project tailscale status
```

## Tailscale tags

The container advertises itself with tag: `tag:vscode`, `tag:container`. You
can use these in your Tailscale ACLs:

```json
{
  "tagOwners": {
    "tag:vscode": ["autogroup:admin"],
    "tag:container": ["autogroup:admin"]
  },
  "acls": [
    {"action": "accept", "src": ["tag:vscode"], "dst": ["*:*"]}
  ]
}
```

## License

MIT
