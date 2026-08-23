# Installation (Development)

This covers getting the platform running locally from a fresh clone. For a
production deployment (HTTPS, hardened images, resource limits), see
[DEPLOYMENT.md](./DEPLOYMENT.md) instead.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2 (`docker compose version`)
- A Linux host, or Docker Desktop on macOS/Windows (the API needs access to
  a real Docker socket — Docker-in-Docker-in-a-VM works fine)
- Node.js 20+ and npm, only if you plan to run the API or frontend outside
  Docker for local development
- `openssl` (to generate a `JWT_SECRET`)

## 1. Clone and configure

```bash
git clone <your-fork-url> bot-hosting-platform
cd bot-hosting-platform
cp .env.example .env
```

Edit `.env` and set at minimum:

- `POSTGRES_PASSWORD`
- `JWT_SECRET` — generate one with `openssl rand -hex 32`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the account created by the seed script

Full variable reference: [ENVIRONMENT.md](./ENVIRONMENT.md).

## 2. Create host storage directories

Bot files and backups live on the host filesystem (bind-mounted, not in a
named Docker volume — see the note in `docker-compose.yml` for why). Run:

```bash
./scripts/init.sh
```

This creates `SERVERS_ROOT` and `BACKUPS_ROOT` (default
`/srv/bot-hosting/servers` and `/srv/bot-hosting/backups`) with permissions
the containers can write to. If you changed those paths in `.env`, the
script picks up the new values automatically.

## 3. Build and start the stack

```bash
docker compose up -d --build
```

This starts, in order (via `depends_on` + healthchecks): PostgreSQL, Redis,
the NestJS API, the Next.js frontend, and Nginx.

Check everything is healthy:

```bash
docker compose ps
curl http://localhost:4000/api/health/ready
```

## 4. Run database migrations and create the admin account

Migrations run automatically on API container boot (`prisma migrate deploy`).
To create the first admin user:

```bash
docker compose exec api npm run seed
```

This uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

## 5. Log in

Visit `http://localhost:3000`, log in with the admin credentials, and you're in.

## Running without Docker (backend/frontend dev servers)

Useful for fast iteration on the API or UI. You'll still need Postgres,
Redis, and a Docker socket available (the API talks to Docker Engine even in
this mode, so bot containers still work).

```bash
# start just the infra
docker compose up -d postgres redis

# backend
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate:dev
npm run seed
npm run start:dev        # http://localhost:4000

# frontend, in a second terminal
cd frontend
npm install
npm run dev               # http://localhost:3000
```

Point `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` in your shell or a
`frontend/.env.local` at `http://localhost:4000` / `ws://localhost:4000`.

## Running tests

```bash
# backend unit tests
cd backend && npm test

# backend e2e tests
cd backend && npm run test:e2e

# frontend component tests
cd frontend && npm test
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `api` container restarts in a loop | Check `docker compose logs api` — usually `DATABASE_URL` not reachable yet, or `JWT_SECRET` unset |
| Bot containers fail to start with a bind-mount error | `SERVERS_ROOT`/`BACKUPS_ROOT` don't exist on the host, or don't match between `.env` and what actually exists — re-run `scripts/init.sh` |
| WebSocket console doesn't connect | `NEXT_PUBLIC_WS_URL` mismatch, or a proxy in front stripping the `Upgrade` header — see `nginx/nginx.conf` for the required config |
| Emails aren't sent | `SMTP_HOST` is blank by default — verification/reset emails are logged to the API console instead of sent, which is fine for local dev |
