# Environment Variables

Copy `.env.example` (development) or `.env.production.example` (production)
to `.env` and fill these in. Variables marked **required in prod** have no
default in `docker-compose.prod.yml` and will fail fast on startup if unset.

## Domain

| Variable | Default | Description |
|---|---|---|
| `SERVER_NAME` | — | **Required in prod.** Your public domain (e.g. `panel.example.com`). Used by `scripts/render-nginx-prod.sh` to template `nginx/nginx.prod.conf`. |

## PostgreSQL

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `platform` | DB username |
| `POSTGRES_PASSWORD` | — | **Required.** Use a long random value in prod. |
| `POSTGRES_DB` | `platform` | Database name |

The API builds `DATABASE_URL` from these automatically inside Compose; you
don't set `DATABASE_URL` directly unless running the API outside Docker.

## Storage paths

| Variable | Default | Description |
|---|---|---|
| `SERVERS_ROOT` | `/srv/bot-hosting/servers` | Host directory holding each server's file tree. **Must be an absolute host path** and identical inside/outside the API container (see the note in `docker-compose.yml`) because the API creates bot containers via the host Docker daemon, which resolves bind-mount sources against the host filesystem. |
| `BACKUPS_ROOT` | `/srv/bot-hosting/backups` | Host directory holding per-server ZIP backups. Same constraint as above. |

Run `scripts/init.sh` after setting these to create the directories with the
right permissions.

## Auth

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | — | **Required.** Generate with `openssl rand -hex 32`. Rotating this invalidates all existing sessions. |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime, any `ms`-style string (`1h`, `30m`, `7d`) |

## Frontend ↔ Backend wiring

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base URL the browser uses for REST calls. In prod, your public HTTPS URL (e.g. `https://panel.example.com/api`). |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:4000` | Base URL for the Socket.IO console connection. In prod, `wss://panel.example.com`. |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated list of origins the API accepts requests from. Must match your actual frontend URL(s). |
| `FRONTEND_URL` | `http://localhost:3000` | Used to build links inside verification/password-reset emails (`auth.service.ts`). |

## First admin account

| Variable | Default | Description |
|---|---|---|
| `ADMIN_EMAIL` | `admin@example.com` | Created by `npm run seed` |
| `ADMIN_PASSWORD` | — | **Required — change before first login.** |

## Outbound email (optional)

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | *(blank)* | If left blank, verification/reset emails are logged to the API console instead of sent — fine for local/dev use. |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | Set `true` for port 465 (implicit TLS) |
| `SMTP_USER` | *(blank)* | |
| `SMTP_PASS` | *(blank)* | |
| `MAIL_FROM` | `Bot Hosting Platform <no-reply@localhost>` | |

## Production-only

| Variable | Default | Description |
|---|---|---|
| `DOCKER_GID` | `999` | GID of the `docker` group on the host, so the non-root user in `Dockerfile.prod` can access the mounted socket. Get it with `stat -c '%g' /var/run/docker.sock`. |
| `RELEASE_TAG` | `latest` | Image tag to build/pull, set automatically by `.github/workflows/release.yml` on tagged releases. |
| `LETSENCRYPT_EMAIL` | `admin@example.com` | Used only for the manual first-issuance `certbot certonly` command in [DEPLOYMENT.md](./DEPLOYMENT.md); the renewal sidecar reuses the resulting certs. |

## Notes

- Never commit a real `.env` file — both `.env` and `.env.production` are in
  `.gitignore`.
- In prod, prefer injecting secrets (`JWT_SECRET`, `POSTGRES_PASSWORD`,
  `SMTP_PASS`) via your platform's secret manager rather than a plaintext
  `.env` file where practical.
