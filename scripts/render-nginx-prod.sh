#!/usr/bin/env bash
# Renders nginx/nginx.prod.conf -> nginx/nginx.prod.rendered.conf with
# ${SERVER_NAME} substituted for your real domain. Run this once (and again
# any time you change SERVER_NAME) before `docker compose -f
# docker-compose.prod.yml up`.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  # Load KEY="value" pairs without ever passing the file through
  # `source`/`eval` — a value containing spaces, <, >, $, `, &, or | would
  # otherwise be re-parsed as shell syntax instead of taken literally.
  # Strips at most one matching pair of surrounding quotes, matching how
  # Docker Compose itself reads .env for ${VAR} substitution.
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
  done < "$ENV_FILE"
fi

if [ -z "${SERVER_NAME:-}" ]; then
  echo "ERROR: SERVER_NAME is not set. Add SERVER_NAME=yourdomain.com to .env" >&2
  exit 1
fi

if ! command -v envsubst >/dev/null 2>&1; then
  echo "ERROR: envsubst not found. Install gettext-base (Debian/Ubuntu: apt install gettext-base)." >&2
  exit 1
fi

SRC="$ROOT_DIR/nginx/nginx.prod.conf"
DEST="$ROOT_DIR/nginx/nginx.prod.rendered.conf"

SERVER_NAME="$SERVER_NAME" envsubst '${SERVER_NAME}' < "$SRC" > "$DEST"

echo "Rendered $DEST for server_name: $SERVER_NAME"
echo "docker-compose.prod.yml mounts this rendered file automatically."
