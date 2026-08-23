# Backups

There are two independent backup layers. They complement each other — set
up both.

## 1. In-app per-server backups (user-facing)

Lets a user snapshot and restore a single bot's file tree from the UI.

- **Create**: `POST /api/servers/:id/backups` zips the server's file tree
  (`backend/src/backups/backups.service.ts`) and stores it under
  `BACKUPS_ROOT`. Queued through BullMQ (`backups.processor.ts`) so large
  servers don't block the request.
- **Restore**: `POST /api/servers/:id/backups/:backupId/restore` unzips the
  chosen backup back over the server's files (zip-slip protected).
- **Download**: `GET /api/servers/:id/backups/:backupId/download` streams
  the raw ZIP.
- **Scheduled backups**: `scheduled-backups.task.ts` runs on a cron schedule
  and can auto-create backups per server if enabled in server settings.
- **Delete**: `DELETE /api/servers/:id/backups/:backupId`.

These backups are stored on the *same host* as the live data — they protect
against "I broke my bot's files" but **not** against disk failure or host
loss. That's what layer 2 is for.

## 2. Infrastructure backups (operator-facing)

A disaster-recovery snapshot of the whole platform: the Postgres database
plus every server's file tree, meant to be copied off-host.

Script: `scripts/backup-cron.sh`

```bash
BACKUP_DEST=/mnt/offsite-backups ./scripts/backup-cron.sh
```

What it does, in order:

1. `pg_dump`s the running Postgres container, gzipped.
2. `tar.gz`s the entire `SERVERS_ROOT` directory tree.
3. Moves both into a timestamped folder under `BACKUP_DEST`.
4. Prunes folders under `BACKUP_DEST` older than `RETENTION_DAYS` (default
   14).

### Scheduling it

Install `deploy/crontab.example` (adjust the repo path first):

```bash
crontab -e
# paste the contents of deploy/crontab.example, editing the path
```

By default this runs the backup daily at 03:00 with 14-day retention, plus a
weekly `docker system prune` to keep disk usage bounded. Logs go to
`/var/log/bot-hosting-platform/backup.log` — make sure that directory exists
and is writable, or point the redirect elsewhere.

### Getting backups off-host

`BACKUP_DEST` should itself be something durable and off the same disk/host
— an NFS mount, an object-storage-backed FUSE mount (e.g. `rclone mount`),
or a separate backup server you `rsync` to on a schedule. The script itself
just writes to a local path; how that path gets replicated off-host is
deployment-specific.

### Restoring from an infrastructure backup

```bash
# Restore the database
gunzip -c /mnt/offsite-backups/<timestamp>/db-<timestamp>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" "$POSTGRES_DB"

# Restore server files (stop the stack first to avoid writes mid-restore)
docker compose -f docker-compose.prod.yml stop api web
tar -xzf /mnt/offsite-backups/<timestamp>/servers-<timestamp>.tar.gz \
  -C "$(dirname "$SERVERS_ROOT")"
docker compose -f docker-compose.prod.yml start api web
```

Always test a restore in a staging environment before you need it for real.
