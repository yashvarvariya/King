#!/usr/bin/env bash
#
# update.sh — Safe production updater for bot-hosting-platform
#
# Pulls the latest code from GitHub, backs up everything that matters,
# replaces only application files, runs Prisma migrations safely,
# rebuilds Docker images, restarts services, and verifies health.
#
# Usage:
#   bash update.sh                 Run a normal update
#   bash update.sh --no-cache      Rebuild Docker images without layer cache
#   bash update.sh --rollback      Roll back to the most recent backup
#   bash update.sh --rollback TS   Roll back to a specific backup (timestamp dir name)
#   bash update.sh --list-backups  List available backups
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — edit these if your paths differ
# ---------------------------------------------------------------------------
REPO_URL="https://github.com/yashvarvariya/King.git"
REPO_BRANCH="main"                      # change if your default branch differs
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # directory this script lives in
COMPOSE_FILE="docker-compose.prod.yml"
BACKUPS_DIR="${APP_DIR}/../update-backups"
TMP_CLONE_DIR="${APP_DIR}/../_update_tmp"
KEEP_BACKUPS=5                          # how many update backups to retain

# Paths inside APP_DIR that must NEVER be touched by an update
PROTECTED_PATHS=(
  ".env"
  ".env.production"
  "nginx/nginx.prod.rendered.conf"
  "uploads"
  "branding"
  "update-system"
  "update.sh"
  "UPDATE.md"
)

TS="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${BACKUPS_DIR}/update-${TS}.log"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
c_green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
c_red()   { printf '\033[0;31m%s\033[0m\n' "$1"; }
c_yellow(){ printf '\033[1;33m%s\033[0m\n' "$1"; }
c_blue()  { printf '\033[0;34m%s\033[0m\n' "$1"; }

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
fail() { c_red "ERROR: $*"; log "ERROR: $*"; exit 1; }
step() { echo; c_blue "==> $*"; log "STEP: $*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' not found. Please install it first."
}

# install.sh writes .env values as KEY="value" (see its set_env()) so the
# file is safe to read without ever `source`-ing it. When pulling a value
# out with grep+cut below, strip that one matching pair of quotes back off.
strip_quotes() {
  local val="$1"
  if { [ "${val:0:1}" = '"' ] && [ "${val: -1}" = '"' ]; } || \
     { [ "${val:0:1}" = "'" ] && [ "${val: -1}" = "'" ]; }; then
    val="${val:1:${#val}-2}"
  fi
  printf '%s' "$val"
}

dc() {
  docker compose -f "${APP_DIR}/${COMPOSE_FILE}" "$@"
}

# ---------------------------------------------------------------------------
# 0. Pre-flight checks
# ---------------------------------------------------------------------------
preflight() {
  step "Running pre-flight checks"
  require_cmd docker
  require_cmd rsync
  require_cmd git
  require_cmd tar

  [ -f "${APP_DIR}/${COMPOSE_FILE}" ] || fail "This does not look like an existing installation (missing ${COMPOSE_FILE} in ${APP_DIR}). Aborting — refusing to run a fresh install."
  [ -f "${APP_DIR}/.env" ] || fail "Missing .env in ${APP_DIR}. Aborting for safety."

  mkdir -p "$BACKUPS_DIR"
  log "Existing installation detected at ${APP_DIR}"
}

# ---------------------------------------------------------------------------
# 1. Backup everything that matters
# ---------------------------------------------------------------------------
backup() {
  local dest="${BACKUPS_DIR}/${TS}"
  mkdir -p "$dest"/{env,volumes,db,app-snapshot}
  step "Creating backup at ${dest}"

  # --- .env files ---
  cp -a "${APP_DIR}/.env" "$dest/env/.env"
  [ -f "${APP_DIR}/.env.production" ] && cp -a "${APP_DIR}/.env.production" "$dest/env/.env.production" || true
  log "Backed up .env file(s)"

  # --- uploads / branding / persistent app-level dirs (if they exist) ---
  for p in uploads branding; do
    if [ -d "${APP_DIR}/${p}" ]; then
      tar -czf "$dest/env/${p}.tar.gz" -C "${APP_DIR}" "${p}"
      log "Backed up ${p}/"
    fi
  done

  # --- SERVERS_ROOT / BACKUPS_ROOT referenced from .env (hosting + backup data) ---
  # These live outside the repo and are never touched by the update itself,
  # but we record their paths so you always know where they are.
  SERVERS_ROOT_VAL="$(strip_quotes "$(grep -E '^SERVERS_ROOT=' "${APP_DIR}/.env" | cut -d= -f2- || true)")"
  BACKUPS_ROOT_VAL="$(strip_quotes "$(grep -E '^BACKUPS_ROOT=' "${APP_DIR}/.env" | cut -d= -f2- || true)")"
  {
    echo "SERVERS_ROOT=${SERVERS_ROOT_VAL:-unset}"
    echo "BACKUPS_ROOT=${BACKUPS_ROOT_VAL:-unset}"
    echo "(These directories are NOT copied by update.sh — they live outside"
    echo " the repo and are left completely untouched.)"
  } > "$dest/env/persistent-data-paths.txt"

  # --- snapshot of current application code (for full rollback) ---
  tar -czf "$dest/app-snapshot/app.tar.gz" \
    -C "${APP_DIR}" \
    --exclude='./update-backups' \
    --exclude='./_update_tmp' \
    --exclude='./**/node_modules' \
    --exclude='./**/dist' \
    --exclude='./**/.next' \
    --exclude='./.git' \
    .
  log "Backed up current application code snapshot"

  # --- Docker named volumes (postgres_data, redis_data, certbot_certs, certbot_www) ---
  local volumes
  volumes="$(dc config --volumes 2>/dev/null || true)"
  if [ -z "$volumes" ]; then
    log "Could not list compose volumes; skipping volume backup (containers may be down)"
  else
    local project
    project="$(basename "${APP_DIR}")"
    for vol in $volumes; do
      local full_vol="${project}_${vol}"
      if docker volume inspect "$full_vol" >/dev/null 2>&1; then
        docker run --rm \
          -v "${full_vol}:/data:ro" \
          -v "${dest}/volumes:/backup" \
          alpine sh -c "tar -czf /backup/${vol}.tar.gz -C /data ." \
          && log "Backed up Docker volume: ${full_vol}"
      fi
    done
  fi

  # --- Database dump (extra safety net on top of the volume backup) ---
  if dc ps postgres 2>/dev/null | grep -q "Up\|running"; then
    local pg_user pg_db
    pg_user="$(strip_quotes "$(grep -E '^POSTGRES_USER=' "${APP_DIR}/.env" | cut -d= -f2- || echo platform)")"
    pg_db="$(strip_quotes "$(grep -E '^POSTGRES_DB=' "${APP_DIR}/.env" | cut -d= -f2- || echo platform)")"
    if dc exec -T postgres pg_dump -U "${pg_user:-platform}" "${pg_db:-platform}" \
        | gzip > "$dest/db/dump.sql.gz"; then
      log "Backed up database via pg_dump"
    else
      c_yellow "WARNING: pg_dump failed — continuing, but you only have the volume backup for the DB."
    fi
  else
    c_yellow "postgres container not running — skipping pg_dump (volume backup still taken if available)"
  fi

  echo "$TS" > "${BACKUPS_DIR}/.last-backup"
  c_green "Backup complete: ${dest}"

  # prune old backups
  prune_backups
}

prune_backups() {
  local count
  count="$(find "$BACKUPS_DIR" -maxdepth 1 -mindepth 1 -type d | wc -l)"
  if [ "$count" -gt "$KEEP_BACKUPS" ]; then
    find "$BACKUPS_DIR" -maxdepth 1 -mindepth 1 -type d -printf '%T@ %p\n' \
      | sort -n | head -n "$((count - KEEP_BACKUPS))" | cut -d' ' -f2- \
      | while read -r old; do
          log "Pruning old backup: ${old}"
          rm -rf "$old"
        done
  fi
}

# ---------------------------------------------------------------------------
# 2. Download latest code from GitHub
# ---------------------------------------------------------------------------
fetch_latest() {
  step "Fetching latest code from ${REPO_URL} (${REPO_BRANCH})"
  rm -rf "$TMP_CLONE_DIR"
  git clone --depth=1 --branch "$REPO_BRANCH" "$REPO_URL" "$TMP_CLONE_DIR" \
    || fail "git clone failed. Check network access and repo URL/branch."
  log "Cloned latest code into ${TMP_CLONE_DIR}"

  # Some repos ship the project as a zip inside the git repo instead of raw
  # source (seen previously with this project). Detect and unzip if needed.
  if [ ! -f "${TMP_CLONE_DIR}/${COMPOSE_FILE}" ]; then
    local zip_file
    zip_file="$(find "$TMP_CLONE_DIR" -maxdepth 2 -iname '*.zip' | head -n1 || true)"
    if [ -n "$zip_file" ]; then
      log "Repo root missing ${COMPOSE_FILE}; found zip ${zip_file} — extracting"
      require_cmd unzip
      unzip -q -o "$zip_file" -d "$TMP_CLONE_DIR/_extracted"
      local found_root
      found_root="$(find "$TMP_CLONE_DIR/_extracted" -maxdepth 3 -iname "$COMPOSE_FILE" -printf '%h\n' | head -n1 || true)"
      [ -n "$found_root" ] || fail "Could not locate ${COMPOSE_FILE} even after extracting the zip."
      SOURCE_ROOT="$found_root"
    else
      # last resort: search a few levels deep for the compose file
      local found_root
      found_root="$(find "$TMP_CLONE_DIR" -maxdepth 3 -iname "$COMPOSE_FILE" -printf '%h\n' | head -n1 || true)"
      [ -n "$found_root" ] || fail "Could not locate ${COMPOSE_FILE} in the cloned repo. Aborting update — nothing changed."
      SOURCE_ROOT="$found_root"
    fi
  else
    SOURCE_ROOT="$TMP_CLONE_DIR"
  fi
  log "Using source root: ${SOURCE_ROOT}"
}

# ---------------------------------------------------------------------------
# 3. Replace application files only (protected paths are never touched)
# ---------------------------------------------------------------------------
apply_update() {
  step "Applying update (protected paths are excluded)"

  local exclude_args=()
  for p in "${PROTECTED_PATHS[@]}"; do
    exclude_args+=(--exclude "$p")
  done
  # never touch the git/dev artifacts either
  exclude_args+=(--exclude ".git" --exclude "node_modules" --exclude "dist" --exclude ".next")

  rsync -a --delete \
    "${exclude_args[@]}" \
    "${SOURCE_ROOT}/" "${APP_DIR}/" \
    || fail "rsync failed while copying updated files. Your backup is safe at ${BACKUPS_DIR}/${TS} — see UPDATE.md to roll back."

  log "Application files updated. Protected paths left untouched: ${PROTECTED_PATHS[*]}"

  # regenerate the rendered nginx config from the (possibly updated) template
  if [ -x "${APP_DIR}/scripts/render-nginx-prod.sh" ]; then
    (cd "$APP_DIR" && ./scripts/render-nginx-prod.sh) \
      && log "Re-rendered nginx/nginx.prod.rendered.conf" \
      || c_yellow "WARNING: render-nginx-prod.sh failed — check nginx config manually before relying on it."
  fi

  rm -rf "$TMP_CLONE_DIR"
}

# ---------------------------------------------------------------------------
# 4. Prisma migrations (safe — never resets/recreates the database)
# ---------------------------------------------------------------------------
run_migrations() {
  step "Checking for Prisma schema changes"

  if [ ! -d "${APP_DIR}/backend/prisma/migrations" ]; then
    c_yellow "No backend/prisma/migrations directory found — skipping 'migrate deploy'."
    c_yellow "If the schema changed, generate a migration with 'prisma migrate dev' in development first."
    return
  fi

  # Make sure api container (with prisma CLI + schema) is up before running migrate deploy
  dc up -d postgres redis
  dc run --rm api npx prisma migrate deploy \
    || fail "Prisma migration failed. Database was NOT reset. Restore from backup if needed (see UPDATE.md)."
  log "Prisma migrations applied successfully (no data loss — 'migrate deploy' never drops data)"
}

# ---------------------------------------------------------------------------
# 5. Rebuild + restart
# ---------------------------------------------------------------------------
rebuild_and_restart() {
  step "Rebuilding Docker images"
  local build_args=()
  [ "${NO_CACHE:-0}" = "1" ] && build_args+=(--no-cache)
  dc build "${build_args[@]}" api web || fail "Docker build failed. Application files were updated but containers were NOT restarted. Fix the build error, then re-run: bash update.sh"

  step "Restarting services"
  dc up -d || fail "docker compose up failed after a successful build. Check 'docker compose -f ${COMPOSE_FILE} logs'."
}

# ---------------------------------------------------------------------------
# 6. Verification
# ---------------------------------------------------------------------------
verify() {
  step "Verifying installation health"
  sleep 8

  local ok=1
  for svc in postgres redis api web nginx; do
    local status
    status="$(dc ps "$svc" --format '{{.Status}}' 2>/dev/null || echo 'missing')"
    if echo "$status" | grep -qi "healthy\|running\|up"; then
      c_green "  ✓ ${svc}: ${status}"
    else
      c_red "  ✗ ${svc}: ${status}"
      ok=0
    fi
  done

  # Hit the API health endpoint from inside the network as a final check
  if dc exec -T api wget -qO- http://localhost:4000/api/health >/dev/null 2>&1; then
    c_green "  ✓ API /api/health responded"
  else
    c_yellow "  ! Could not confirm API /api/health (service may still be starting — check manually)"
    ok=0
  fi

  if [ "$ok" -eq 1 ]; then
    c_green "Update completed successfully and all services are healthy."
  else
    c_yellow "Update finished but one or more services are not confirmed healthy."
    c_yellow "Check: docker compose -f ${COMPOSE_FILE} ps   and   docker compose -f ${COMPOSE_FILE} logs"
    c_yellow "A full backup is available at ${BACKUPS_DIR}/${TS} if you need to roll back (see UPDATE.md)."
  fi
}

# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------
list_backups() {
  [ -d "$BACKUPS_DIR" ] || { echo "No backups found."; exit 0; }
  echo "Available backups:"
  find "$BACKUPS_DIR" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' | sort
}

rollback() {
  local target="${1:-}"
  if [ -z "$target" ]; then
    [ -f "${BACKUPS_DIR}/.last-backup" ] || fail "No backups found to roll back to."
    target="$(cat "${BACKUPS_DIR}/.last-backup")"
  fi
  local dest="${BACKUPS_DIR}/${target}"
  [ -d "$dest" ] || fail "Backup '${target}' not found in ${BACKUPS_DIR}."

  c_yellow "Rolling back to backup: ${target}"
  read -r -p "This will stop services, restore code + .env + database + volumes. Continue? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

  step "Stopping services"
  dc down

  step "Restoring application code snapshot"
  tar -xzf "$dest/app-snapshot/app.tar.gz" -C "$APP_DIR"

  step "Restoring .env"
  cp -a "$dest/env/.env" "${APP_DIR}/.env"
  [ -f "$dest/env/.env.production" ] && cp -a "$dest/env/.env.production" "${APP_DIR}/.env.production" || true
  for p in uploads branding; do
    [ -f "$dest/env/${p}.tar.gz" ] && tar -xzf "$dest/env/${p}.tar.gz" -C "$APP_DIR"
  done

  if [ -d "$dest/volumes" ] && [ -n "$(ls -A "$dest/volumes" 2>/dev/null)" ]; then
    step "Restoring Docker volumes"
    local project
    project="$(basename "$APP_DIR")"
    for vol_backup in "$dest"/volumes/*.tar.gz; do
      local vol_name full_vol
      vol_name="$(basename "$vol_backup" .tar.gz)"
      full_vol="${project}_${vol_name}"
      docker volume create "$full_vol" >/dev/null
      docker run --rm -v "${full_vol}:/data" -v "${dest}/volumes:/backup" \
        alpine sh -c "rm -rf /data/* && tar -xzf /backup/${vol_name}.tar.gz -C /data"
      log "Restored volume ${full_vol}"
    done
  fi

  step "Rebuilding and starting services from restored code"
  dc build api web
  dc up -d

  verify
  c_green "Rollback to ${target} complete."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
NO_CACHE=0
ACTION="update"
ROLLBACK_TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --no-cache)
      NO_CACHE=1
      shift
      ;;
    --rollback)
      ACTION="rollback"
      shift
      # optional timestamp argument (skip if it looks like another flag or is absent)
      if [ $# -gt 0 ] && [[ "$1" != --* ]]; then
        ROLLBACK_TARGET="$1"
        shift
      fi
      ;;
    --list-backups)
      ACTION="list"
      shift
      ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^#//'
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

mkdir -p "$BACKUPS_DIR"

case "$ACTION" in
  list)
    list_backups
    ;;
  rollback)
    preflight
    rollback "$ROLLBACK_TARGET"
    ;;
  update)
    preflight
    backup
    fetch_latest
    apply_update
    run_migrations
    rebuild_and_restart
    verify
    echo
    c_green "Log saved to: ${LOG_FILE}"
    ;;
esac
