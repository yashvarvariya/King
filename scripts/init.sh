#!/usr/bin/env bash
# Run once on the host before `docker compose up` (or re-run if you change
# SERVERS_ROOT / BACKUPS_ROOT in .env). Creates the bind-mount directories
# that both the API container and the host Docker daemon need to agree on.
set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env"

# Load KEY="value" pairs without ever passing the file through
# `source`/`eval` — a value containing spaces, <, >, $, `, &, or | would
# otherwise be re-parsed as shell syntax instead of taken literally. Strips
# at most one matching pair of surrounding quotes, matching how Docker
# Compose itself reads .env for ${VAR} substitution.
load_env() {
  local file="$1" line key val
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    if { [ "${val:0:1}" = '"' ] && [ "${val: -1}" = '"' ]; } || \
       { [ "${val:0:1}" = "'" ] && [ "${val: -1}" = "'" ]; }; then
      val="${val:1:${#val}-2}"
    fi
    export "${key}=${val}"
  done < "$file"
}

load_env "$ENV_FILE"

SERVERS_ROOT="${SERVERS_ROOT:-/srv/bot-hosting/servers}"
BACKUPS_ROOT="${BACKUPS_ROOT:-/srv/bot-hosting/backups}"

echo "Creating $SERVERS_ROOT and $BACKUPS_ROOT ..."
sudo mkdir -p "$SERVERS_ROOT" "$BACKUPS_ROOT"
sudo chmod 755 "$SERVERS_ROOT" "$BACKUPS_ROOT"

echo "Done. You can now run: docker compose up -d --build"
