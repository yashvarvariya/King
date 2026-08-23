#!/usr/bin/env bash
# Infrastructure-level backup: dumps the Postgres database and archives the
# SERVERS_ROOT directory tree to a dated file under $BACKUP_DEST.
#
# This is separate from (and complements) the in-app per-server ZIP backup
# feature (backend/src/backups) — that one lets a user roll back a single
# bot's files from the UI; this one is a disaster-recovery snapshot of the
# whole platform (every server's files + the database) meant to be copied
# off-host.
#
# Usage:
#   BACKUP_DEST=/mnt/offsite-backups ./scripts/backup-cron.sh
#
# Recommended crontab entry (see BACKUPS.md for the full explanation):
#   0 3 * * * BACKUP_DEST=/mnt/offsite-backups /opt/bot-hosting-platform/scripts/backup-cron.sh >> /var/log/bot-hosting-platform/backup.log 2>&1

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

BACKUP_DEST="${BACKUP_DEST:-/srv/bot-hosting/infra-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p "$BACKUP_DEST"

echo "[backup-cron] $(date -Is) starting backup -> $BACKUP_DEST"

# --- 1. Postgres dump (via the running container, so no local pg_dump needed) ---
DB_DUMP="$WORKDIR/db-${TIMESTAMP}.sql.gz"
docker compose -f "$ROOT_DIR/docker-compose.prod.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-platform}" "${POSTGRES_DB:-platform}" \
  | gzip -9 > "$DB_DUMP"
echo "[backup-cron] database dumped to $DB_DUMP ($(du -h "$DB_DUMP" | cut -f1))"

# --- 2. Archive server file trees ---
SERVERS_ARCHIVE="$WORKDIR/servers-${TIMESTAMP}.tar.gz"
if [ -d "${SERVERS_ROOT:-/srv/bot-hosting/servers}" ]; then
  tar -czf "$SERVERS_ARCHIVE" -C "$(dirname "${SERVERS_ROOT}")" "$(basename "${SERVERS_ROOT}")"
  echo "[backup-cron] servers archived to $SERVERS_ARCHIVE ($(du -h "$SERVERS_ARCHIVE" | cut -f1))"
else
  echo "[backup-cron] WARNING: SERVERS_ROOT not found, skipping servers archive"
fi

# --- 3. Move into place atomically ---
DEST_DIR="$BACKUP_DEST/$TIMESTAMP"
mkdir -p "$DEST_DIR"
mv "$DB_DUMP" "$DEST_DIR/"
[ -f "$SERVERS_ARCHIVE" ] && mv "$SERVERS_ARCHIVE" "$DEST_DIR/"

# --- 4. Prune old backups beyond retention window ---
find "$BACKUP_DEST" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \;

echo "[backup-cron] $(date -Is) done. Backup stored at $DEST_DIR"
