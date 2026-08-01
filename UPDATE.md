# Updating the Hosting Panel

This project ships with a **safe, automatic updater** (`update.sh`) that
pulls the latest code straight from GitHub and updates your live
installation without touching your data.

Repository: https://github.com/yashvarvariya/King.git

---

## What gets updated vs. what is protected

| Updated by `update.sh`            | Never touched                          |
|------------------------------------|-----------------------------------------|
| Backend/frontend source code       | `.env`, `.env.production`               |
| Dockerfiles, nginx template        | `uploads/`, `branding/`                 |
| Prisma schema (via safe migration) | PostgreSQL data (Docker volume)         |
| Scripts, docs                      | Redis data (Docker volume)              |
|                                     | `certbot_certs` / `certbot_www` volumes |
|                                     | `nginx/nginx.prod.rendered.conf`* |
|                                     | `SERVERS_ROOT` / `BACKUPS_ROOT` (hosting + backup data — lives outside the repo entirely) |

\* the rendered nginx config is regenerated from the (possibly updated)
template using your existing `.env`, it isn't blindly overwritten.

---

## How to update

From the installation directory (the folder containing
`docker-compose.prod.yml`):

```bash
bash update.sh
```

This will, in order:

1. Verify this is an existing installation (refuses to run if `.env` or
   `docker-compose.prod.yml` is missing — it will never do a fresh install).
2. **Back up**: `.env`, `uploads/`, `branding/`, a full code snapshot, all
   Docker volumes (`postgres_data`, `redis_data`, `certbot_certs`,
   `certbot_www`), and a `pg_dump` of the database — into
   `../update-backups/<timestamp>/`.
3. Clone the latest code from GitHub into a temp folder.
4. Copy over only application files, leaving `.env`, `uploads/`,
   `branding/`, and Docker volumes completely untouched.
5. Run `prisma migrate deploy` **only if** a `backend/prisma/migrations`
   folder exists in the new code. This applies schema changes without ever
   dropping or recreating the database.
6. Rebuild the `api` and `web` Docker images.
7. Restart all services with `docker compose up -d`.
8. Verify that postgres, redis, api, web, and nginx are all healthy, and
   that `/api/health` responds.

A full log is written to `../update-backups/update-<timestamp>.log`.

### Rebuild without Docker's layer cache

```bash
bash update.sh --no-cache
```

Use this if you suspect a stale Docker layer is causing issues.

---

## Rollback

Every update creates a full backup before making any changes. If an update
causes a problem, you can roll back:

```bash
# Roll back to the most recent backup
bash update.sh --rollback

# See available backups first
bash update.sh --list-backups

# Roll back to a specific one
bash update.sh --rollback 20260801-153000
```

Rollback will:

1. Ask for confirmation (this stops your services).
2. Stop all containers.
3. Restore the application code snapshot.
4. Restore `.env`, `.env.production`, `uploads/`, `branding/`.
5. Restore all Docker volumes (Postgres, Redis, certbot certs) from the
   backup archive.
6. Rebuild and restart everything.
7. Run the same health verification as a normal update.

The last **5** update backups are kept automatically; older ones are
pruned to save disk space. Change `KEEP_BACKUPS` at the top of `update.sh`
if you want to keep more/fewer.

---

## Recovery steps if something goes wrong mid-update

The script is written so that a failure at any stage stops immediately
(`set -euo pipefail`) **before** it can do damage, and tells you exactly
what already happened:

- **Fails during backup** — nothing was changed yet. Just fix the issue
  (usually disk space or Docker not running) and re-run `bash update.sh`.
- **Fails during `git clone` / fetch** — nothing was changed. Check your
  VPS's internet access and the repo URL/branch in `update.sh`.
- **Fails during file copy (rsync)** — your live files may be partially
  updated. Run `bash update.sh --rollback` to restore the pre-update
  snapshot, then investigate.
- **Fails during Prisma migration** — the database was **not** reset or
  dropped (`migrate deploy` is non-destructive by design). Fix the
  migration issue and re-run, or roll back if needed.
- **Fails during Docker build** — your code was updated but containers were
  never restarted, so the old containers should still be running the old
  images. Fix the build error and re-run `bash update.sh`, or roll back.
- **Services unhealthy after update** — check logs:
  ```bash
  docker compose -f docker-compose.prod.yml logs api --tail=100
  docker compose -f docker-compose.prod.yml logs web --tail=100
  docker compose -f docker-compose.prod.yml logs nginx --tail=100
  ```
  If you can't resolve it quickly, roll back:
  ```bash
  bash update.sh --rollback
  ```

---

## Troubleshooting

**"This does not look like an existing installation"**
You ran `update.sh` from the wrong directory, or `.env` /
`docker-compose.prod.yml` is missing. `cd` into your install directory
first.

**"git clone failed"**
Check outbound internet access from the VPS (`curl -I https://github.com`)
and that `REPO_BRANCH` at the top of `update.sh` matches your repo's
actual default branch.

**"Could not locate docker-compose.prod.yml in the cloned repo"**
The updater also handles the case where the GitHub repo contains a `.zip`
of the project instead of raw source files — it will automatically find
and extract it. If it still can't find `docker-compose.prod.yml` after
that, your repo structure has changed; update the `COMPOSE_FILE` path
logic in `update.sh` accordingly.

**Prisma migration skipped**
This is expected if there's no `backend/prisma/migrations` folder in the
new code — nothing to apply. If you changed `schema.prisma` without
generating a migration, do so in development first with
`npx prisma migrate dev`, commit the generated `migrations/` folder, then
update your VPS.

**Disk filling up from backups**
Lower `KEEP_BACKUPS` in `update.sh` (default 5), or manually prune old
folders in `../update-backups/`. Docker volume backups (especially
Postgres) can be large if you have a lot of hosted server data.

**I need my old data back and don't trust the update**
Everything you need is in `../update-backups/<timestamp>/`:
- `env/.env` — your environment file
- `env/uploads.tar.gz`, `env/branding.tar.gz` — if present
- `app-snapshot/app.tar.gz` — full code snapshot
- `volumes/*.tar.gz` — Postgres, Redis, certbot volumes
- `db/dump.sql.gz` — plain SQL database dump (extra safety net)

You can restore any of these manually even without using
`--rollback`, if you need fine-grained control.
