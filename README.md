# Bot Hosting Platform

A self-hosted bot hosting panel — no Pterodactyl, no third-party daemon. The
NestJS API talks directly to the Docker Engine (via `/var/run/docker.sock`)
to give every deployed bot its own isolated, resource-capped container.

## One-command install

On a fresh Ubuntu/Debian VPS with a domain already pointed at it:

```bash
bash <(curl -sL https://raw.githubusercontent.com/yashvarvariya/King/main/install.sh)
```

The installer sets up Docker, asks a few questions (domain, admin email,
password, optional SMTP), generates strong secrets, and brings up the full
production stack (PostgreSQL, Redis, API, Web, Nginx, Let's Encrypt SSL).
Re-running it on an already-installed VPS offers Update / Repair / Cancel.
See [INSTALLER.md](./INSTALLER.md) for the full guide, requirements, and
troubleshooting.

```
┌────────────┐      ┌──────────────┐      ┌──────────────┐
│   Nginx    │──────▶  Next.js UI  │      │  PostgreSQL  │
│ (reverse   │      └──────────────┘      └──────┬───────┘
│  proxy)    │──────▶  NestJS API  │─────────────┘
└────────────┘      │  (REST + WS)│
                     └──────┬───────┘
                            │ dockerode (Docker Engine API)
                     ┌──────▼───────┐
                     │  Redis       │   ┌─────────┐ ┌─────────┐ ┌─────────┐
                     │ (cache/queue)│   │ bot #1  │ │ bot #2  │ │ bot #3  │  ← one
                     └──────────────┘   │container│ │container│ │container│    container
                                         └─────────┘ └─────────┘ └─────────┘    per server
```

## Stack

| Layer      | Tech                                     |
|------------|-------------------------------------------|
| Frontend   | Next.js 14 (App Router) + Tailwind CSS    |
| Backend    | NestJS (REST + Socket.IO gateway)         |
| Database   | PostgreSQL + Prisma ORM                   |
| Cache/Queue| Redis + BullMQ                            |
| Isolation  | Docker Engine API via `dockerode`         |
| Proxy      | Nginx (HTTP in dev, HTTPS/Let's Encrypt in prod) |

## Features

- Email/password auth with JWT (`bcrypt` hashing, guarded routes, email verification, password reset)
- User dashboard: create / rename / delete / suspend servers, resource quotas
- Admin dashboard: platform stats, per-user quota editing, suspend any user or view all servers
- ZIP upload with auto-extract, or clone directly from a GitHub URL
- Full file manager: browse, create, rename, delete, in-browser text editor, drag & drop upload
- Environment variables and a custom startup command per server
- One-click dependency install, auto-detecting `package.json` vs `requirements.txt`
- Start / Stop / Restart / Kill, each mapped to real Docker container operations
- Live console over WebSocket (Socket.IO) — streamed stdout/stderr plus a stdin command box
- Live CPU / RAM / disk usage, polled every 2s per container
- Auto-restart supervisor (cron every 30s) that revives crashed containers
- ZIP backups of a server's file tree, with one-click restore
- Node.js and Python runtimes, each running in a minimal Alpine base image
- Liveness/readiness health endpoints, CI pipeline, CodeQL + dependency scanning, production Docker/Nginx setup

## Documentation

| Doc | What it covers |
|---|---|
| [INSTALL.md](./INSTALL.md) | Local/dev setup from a fresh clone |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment (HTTPS, prod compose) |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Every environment variable, explained |
| [API.md](./API.md) | REST + WebSocket API reference |
| [SECURITY.md](./SECURITY.md) | Threat model, hardening notes, vulnerability reporting |
| [BACKUPS.md](./BACKUPS.md) | In-app backups vs. infrastructure backups |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Dev workflow, coding standards, PR process |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |

## Quick start (development)

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD

./scripts/init.sh          # creates SERVERS_ROOT / BACKUPS_ROOT on the host
docker compose up -d --build

# create the first admin account
docker compose exec api npm run seed
```

Visit `http://localhost:3000`. See [INSTALL.md](./INSTALL.md) for the full walkthrough
(including running the API/frontend outside Docker) and [DEPLOYMENT.md](./DEPLOYMENT.md)
for going to production.

## Project layout

```
backend/                 NestJS API
  src/auth/               register/login/JWT, password reset, email verification
  src/servers/             server CRUD, lifecycle (start/stop/restart/kill), quotas
  src/docker/               dockerode wrapper: container create/start/stop/stats
  src/files/                file manager + ZIP upload/extract (path-traversal safe)
  src/console/              Socket.IO gateway: live logs, stdin, stats push
  src/backups/               zip/unzip backup + restore
  src/admin/                 platform stats, user & quota management
  src/health/                liveness/readiness endpoints
frontend/                Next.js panel
  src/app/                 routes: /, /login, /register, /dashboard, /dashboard/servers/[id]/*, /admin
  src/components/          Navbar, ServerCard, Console, FileManager, ResourceGraph, StatusPill
nginx/                    reverse proxy configs (dev + prod)
deploy/                   logrotate config, example host crontab
scripts/                  init, backup-cron, prod nginx renderer
.github/workflows/        CI, CodeQL, security scan, release
docker-compose.yml        dev/default stack: postgres, redis, api, web, nginx
docker-compose.prod.yml   production stack: adds HTTPS, certbot, non-root images, resource limits
```

## How container isolation works

1. `POST /api/servers` creates a DB row and a folder under `SERVERS_ROOT` —
   no container yet, so you can edit files/env before the first boot.
2. On `Start`, `ServersService.ensureContainer()` calls `DockerService.createContainer()`,
   which bind-mounts that folder into `/home/bot` inside a fresh container and
   applies `Memory`, `MemorySwap`, `CpuQuota`, and `PidsLimit` from the
   server's (and owner's) quotas.
3. `Stop` / `Restart` / `Kill` map straight onto the Docker Engine API.
4. The console WebSocket attaches to the container's stdio; typed input is
   written back to the container's stdin.
5. A cron job (`AutoRestartTask`) polls containers marked `RUNNING` every 30s
   and restarts any that exited unexpectedly, if the server has "Auto
   Restart" enabled.

## License

[MIT](./LICENSE)
