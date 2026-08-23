# Deployment (Production)

This guide covers deploying with `docker-compose.prod.yml`: HTTPS via
Let's Encrypt, non-root hardened images, resource limits, and log rotation.
For local development, see [INSTALL.md](./INSTALL.md).

## Prerequisites

- A Linux server (Ubuntu 22.04/24.04 recommended) with Docker Engine 24+ and
  Docker Compose v2 installed
- A domain name pointed at the server's public IP (an A/AAAA record) —
  required for Let's Encrypt
- Ports 80 and 443 open to the internet
- `gettext-base` installed for `envsubst` (`apt install gettext-base`)

## 1. Clone and configure

```bash
git clone <your-fork-url> /opt/bot-hosting-platform
cd /opt/bot-hosting-platform
cp .env.production.example .env
```

Edit `.env` and fill in **every** value marked "must be set" — the prod
compose file uses `${VAR:?message}` syntax and will refuse to start
otherwise. At minimum:

- `SERVER_NAME` — your domain, e.g. `panel.example.com`
- `POSTGRES_PASSWORD`
- `JWT_SECRET` — `openssl rand -hex 32`
- `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` — your public HTTPS/WSS URLs
- `CORS_ORIGIN` — your public HTTPS URL
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- `DOCKER_GID` — run `stat -c '%g' /var/run/docker.sock` on the host and use that number
- `LETSENCRYPT_EMAIL`

See [ENVIRONMENT.md](./ENVIRONMENT.md) for the full reference.

## 2. Create host storage directories

```bash
./scripts/init.sh
```

## 3. Render the Nginx config

The prod Nginx config is a template — `SERVER_NAME` gets substituted in
before use:

```bash
./scripts/render-nginx-prod.sh
```

Re-run this any time you change `SERVER_NAME` in `.env`. It writes
`nginx/nginx.prod.rendered.conf`, which `docker-compose.prod.yml` mounts.

## 4. Obtain your first TLS certificate

The `certbot` service in `docker-compose.prod.yml` only **renews** existing
certificates — the first issuance is a one-time manual step because Nginx
needs to already be serving the ACME HTTP-01 challenge path, and Nginx's
prod config expects certs to already exist. Bootstrap it like this:

```bash
# Start Postgres/Redis/API/web/nginx (nginx will fail its HTTPS server block
# until certs exist, but the HTTP challenge path is still served)
docker compose -f docker-compose.prod.yml up -d postgres redis api web nginx

# Issue the certificate
docker compose -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d "$SERVER_NAME" \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email

# Reload nginx to pick up the new cert
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

If this is truly the first run and Nginx's HTTPS server block fails to start
because there's no cert yet at all, temporarily comment out the `443`
`server` block in `nginx/nginx.prod.conf`, re-render, bring nginx up on port
80 only, issue the cert, then uncomment and re-render.

## 5. Bring up the full stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## 6. Run migrations and seed the admin account

```bash
docker compose -f docker-compose.prod.yml exec api npm run prisma:migrate
docker compose -f docker-compose.prod.yml exec api npm run seed:prod
```

> `seed:prod` runs the plain-JS build of `prisma/seed.ts` (compiled by
> `Dockerfile.prod`). Plain `npm run seed` uses `ts-node`, which is a
> devDependency and isn't installed in this production image — it will
> fail here.

## 7. Verify

```bash
curl https://$SERVER_NAME/api/health/ready
docker compose -f docker-compose.prod.yml ps
```

All services should show `healthy`. Visit `https://your-domain` in a browser.

## Ongoing operations

- **Certificate renewal** is automatic — the `certbot` container loops every
  12 hours and no-ops unless the cert is within 30 days of expiry.
- **Log rotation**: copy `deploy/logrotate/bot-hosting-platform` to
  `/etc/logrotate.d/` on the host if you redirect container logs to files;
  Docker's own `json-file` driver is already capped (see
  `x-logging` in `docker-compose.prod.yml`, 10MB × 5 files per container).
- **Backups**: see [BACKUPS.md](./BACKUPS.md) and install
  `deploy/crontab.example`.
- **Updates**: pull the new code, rebuild, and restart:
  ```bash
  git pull
  docker compose -f docker-compose.prod.yml up -d --build
  docker compose -f docker-compose.prod.yml exec api npm run prisma:migrate
  ```
- **Rolling back**: set `RELEASE_TAG` in `.env` to a previously built image
  tag (see `.github/workflows/release.yml`) and re-run `up -d` — no rebuild
  needed since the tagged image already exists.

## Reverse proxy / firewall notes

- Only Nginx publishes ports (80/443) in the prod compose file; `api` and
  `web` are reachable only on the internal `platform` Docker network. Don't
  add extra port mappings for them.
- If you run a firewall (ufw/iptables) in front of Docker, only 80/443 (and
  SSH) need to be open; Docker manages its own iptables rules for the
  internal network.
- If you terminate TLS at a different layer (e.g. a cloud load balancer
  instead of the bundled Nginx+certbot), skip steps 3–4 and instead point
  that LB at port 80 on this host, and disable the `443` block in
  `nginx/nginx.prod.conf`.
- **Cloudflare**: `nginx/nginx.prod.conf` already restores the real visitor
  IP from Cloudflare's published ranges (`set_real_ip_from` /
  `real_ip_header CF-Connecting-IP`), so rate limiting and access logs stay
  correct if you proxy through Cloudflare. During initial cert issuance,
  set the DNS record to **DNS only** (grey cloud) — see INSTALLER.md §3.

## See also

- [SECURITY.md](./SECURITY.md) — hardening checklist before exposing this publicly
- [ENVIRONMENT.md](./ENVIRONMENT.md) — full variable reference
