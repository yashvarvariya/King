# Installer Guide

This document covers the one-command production installer (`install.sh`).
For a fully manual walkthrough (useful if you want to understand or
customize every step), see [DEPLOYMENT.md](./DEPLOYMENT.md).

## 1. One-command installation

On a fresh Ubuntu/Debian VPS, as root (or a user with `sudo`):

```bash
bash <(curl -sL https://raw.githubusercontent.com/yashvarvariya/King/main/install.sh)
```

or, if you're fronting it with your own short URL:

```bash
bash <(curl -sL https://apanel.znx.indevs.in)
```

You'll be asked for:

- **Panel domain** (e.g. `botpanel.example.com`) — must already point at this
  server's public IP before you run the installer (see DNS section below).
- **Admin email** and **admin password** (password input is hidden).
- Whether you want **SMTP email/OTP** support, and if so, your SMTP
  credentials plus a sender display name and sender email address (kept as
  two separate values — see ENVIRONMENT.md).
- A **Let's Encrypt email** for certificate notices (defaults to your admin
  email).

The installer then:

1. Detects your OS/architecture and checks RAM, disk, and connectivity.
2. Installs Docker Engine + the Compose plugin if not already present
   (never reinstalls if Docker is already working).
3. Clones the repository into an installation directory (default
   `/opt/bot-hosting-platform`).
4. Generates `JWT_SECRET` and `POSTGRES_PASSWORD` with `openssl rand -hex 32`
   and writes a production `.env` based on the project's own
   `.env.production.example` — no invented variables.
5. Runs the project's existing `scripts/init.sh` and
   `scripts/render-nginx-prod.sh`.
6. Builds and starts the full `docker-compose.prod.yml` stack: PostgreSQL,
   Redis, API, Web, Nginx, and the Certbot renewal sidecar.
7. Issues your first Let's Encrypt certificate (bootstrapping Nginx on port
   80 first, since the HTTPS config needs a certificate to exist before it
   can bind port 443).
8. Runs `prisma migrate deploy` and seeds the first admin account via the
   project's own `npm run seed`.
9. Verifies `/api/health/ready` and reports per-service status.
10. Installs a `panel` management command.

## 2. Requirements

- Ubuntu 22.04/24.04 or Debian, 2+ vCPU recommended, 2GB+ RAM, 5GB+ free disk.
- Root or sudo access.
- Ports **80** and **443** reachable from the internet.

## 3. Domain / DNS requirements

Create an A (and/or AAAA) record pointing your chosen domain at the VPS's
public IP **before** running the installer — Let's Encrypt's HTTP-01
challenge needs it to resolve correctly at issuance time. DNS propagation
can take a few minutes to a few hours depending on your provider.

If you're using Cloudflare: point the DNS record at the VPS and set it to
**DNS only** (grey cloud) for the initial install, or ensure ports 80/443 are
reachable through Cloudflare's proxy. This installer does not use the
Cloudflare API and does not require Cloudflare-specific credentials.
Once installed, `nginx/nginx.prod.conf` already restores the real visitor
IP from Cloudflare's published ranges, so rate limiting and access logs
stay accurate whether or not you proxy through Cloudflare (orange cloud)
afterward.

## 4. Firewall requirements

Only ports **80**, **443**, and your **SSH** port need to be open. Docker
manages its own iptables rules for the internal service network — don't
publish extra ports for `api` or `web`.

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 5. SMTP configuration

If you skip SMTP during install, the platform's existing fallback applies:
emails (verification OTPs, password resets, etc.) are logged to the API
container's console instead of being sent. You can add SMTP later by editing
`.env` in the install directory and running `panel restart`.

## 6. SSL setup

Handled automatically on first install (see step 7 above). Certificates
renew automatically via the `certbot` sidecar container (checks every 12
hours, renews within 30 days of expiry — no action needed from you).

If your domain wasn't pointing at the server yet when you ran the installer,
certificate issuance will fail with a clear error. Fix your DNS record and
re-run the installer — it will detect the existing installation and offer to
repair it.

## 7. Update procedure

Re-run the same installer command on an already-installed VPS:

```bash
bash <(curl -sL https://raw.githubusercontent.com/yashvarvariya/King/main/install.sh)
```

It detects the existing installation and hands off to the project's
`update.sh`, which backs up your `.env`, database, and Docker volumes before
pulling and applying the update. Equivalently, you can run it directly:

```bash
cd /opt/bot-hosting-platform
sudo bash update.sh
```

Or with the management command:

```bash
panel update
```

## 8. Backup procedure

`update.sh` takes a full backup (env files, database dump, Docker volumes,
app code snapshot) before every update, kept under `../update-backups`
relative to the install directory. List them with:

```bash
panel backup
# equivalent to: bash update.sh --list-backups
```

Roll back with:

```bash
cd /opt/bot-hosting-platform
sudo bash update.sh --rollback          # most recent backup
sudo bash update.sh --rollback <TS>     # a specific backup
```

For ongoing/scheduled backups of bot data itself (independent of updates),
see [BACKUPS.md](./BACKUPS.md) and `deploy/crontab.example`.

## 9. Troubleshooting

- **Certificate issuance failed**: confirm `dig +short yourdomain.com`
  returns this server's public IP, and that ports 80/443 aren't blocked by a
  firewall or cloud security group. Re-run the installer once DNS resolves.
- **A service isn't healthy after install**: run `panel status` and
  `panel logs <service>` (e.g. `panel logs api`). Services can take up to a
  minute to report healthy on first boot.
- **Installer log**: `/var/log/bot-hosting-panel-install.log` — no secrets
  are ever written to it, only step names and status.
- **Re-running after a partial failure**: safe to re-run — the installer
  detects an existing `.env` and installation directory and won't overwrite
  data without asking.
- **Docker image build failed**: the installer now diagnoses build
  failures instead of just stopping. It looks at the captured build log
  (`/var/log/bot-hosting-panel-build-logs/`) and:
  - `package.json`/`package-lock.json` out of sync (`npm ci` fails with an
    "in sync" / `EUSAGE` error) → the installer backs up the old lock file
    and regenerates it with `npm install --package-lock-only` (no
    `node_modules` changes, no arbitrary installs), then retries the build.
  - registry/network errors → verifies connectivity and retries once.
  - a genuine Prisma or build-script error → stops immediately with the
    exact log location and a suggested manual fix; this is not something
    that should be auto-repaired.
  - Build retries are capped at 2 (3 attempts total) so a real bug can't
    loop forever — if it still fails, the installer prints the diagnosis,
    the log path, and a manual fix and exits without pretending success.

## 10. Uninstall procedure

```bash
panel uninstall
```

This stops and removes containers, but **never** deletes `SERVERS_ROOT`,
`BACKUPS_ROOT`, or Postgres/Redis data volumes without you doing so
explicitly. To fully remove everything, including hosted bot data:

```bash
cd /opt/bot-hosting-platform
docker compose -f docker-compose.prod.yml down -v   # removes named volumes too
sudo rm -rf /opt/bot-hosting-platform
sudo rm -rf "$SERVERS_ROOT" "$BACKUPS_ROOT"          # only if you want bot data gone too
```
