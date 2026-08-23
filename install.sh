#!/usr/bin/env bash
#
# install.sh — One-command production installer for Bot Hosting Platform
# https://github.com/yashvarvariya/King
#
# Usage (remote, one command):
#   bash <(curl -sL https://raw.githubusercontent.com/yashvarvariya/King/main/install.sh)
#
# Usage (already have the repo locally):
#   ./install.sh
#
# This script provisions Docker if needed, asks a handful of interactive
# questions, generates strong secrets, writes .env, renders the production
# Nginx config, builds/starts the full docker-compose.prod.yml stack,
# runs Prisma migrations, seeds the admin account, issues a Let's Encrypt
# certificate, and verifies health — reusing the project's existing
# scripts/init.sh, scripts/render-nginx-prod.sh, docker-compose.prod.yml,
# Prisma migrations and seed command rather than reimplementing any of it.
#
set -euo pipefail

# ============================================================================
# Constants / configuration
# ============================================================================
REPO_URL="https://github.com/yashvarvariya/King.git"
REPO_BRANCH="main"
DEFAULT_INSTALL_DIR="/opt/bot-hosting-platform"
COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="/var/log/bot-hosting-panel-install.log"
TOTAL_STEPS=13
# Seeded with the default install dir's parent so the disk-space check in
# system_checks() (which runs before the user is asked for an install dir)
# checks the right filesystem; prepare_install_dir() overwrites this once
# the user picks a directory.
INSTALL_DIR_PARENT="$(dirname "$DEFAULT_INSTALL_DIR")"

# ============================================================================
# Output helpers
# ============================================================================
c_green()  { printf '\033[0;32m%s\033[0m\n' "$1"; }
c_red()    { printf '\033[0;31m%s\033[0m\n' "$1"; }
c_yellow() { printf '\033[1;33m%s\033[0m\n' "$1"; }
c_blue()   { printf '\033[0;34m%s\033[0m\n' "$1"; }
c_bold()   { printf '\033[1m%s\033[0m\n' "$1"; }

STEP_NUM=0
step() {
  STEP_NUM=$((STEP_NUM + 1))
  echo
  c_blue "[${STEP_NUM}/${TOTAL_STEPS}] $1"
  log "STEP ${STEP_NUM}/${TOTAL_STEPS}: $1"
}

# Logging: never write secrets here. Only step names / command names / plain
# status text are logged.
log() {
  if [ -w "$(dirname "$LOG_FILE")" ] || [ -w "$LOG_FILE" ] 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$LOG_FILE" 2>/dev/null || true
  fi
}

fail() {
  echo
  c_red "ERROR: $1"
  log "ERROR: $1"
  c_yellow "See ${LOG_FILE} for the step log (no secrets are written to it)."
  exit 1
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      c_yellow "This installer needs root privileges. Re-run with sudo, e.g.:"
      echo "  sudo bash $0"
      exit 1
    else
      fail "This installer must be run as root (no sudo found either)."
    fi
  fi
}

banner() {
  echo "========================================"
  echo "        BOT HOSTING PANEL INSTALLER"
  echo "========================================"
}

# ============================================================================
# Step 1: System checks
# ============================================================================
system_checks() {
  step "Checking system..."

  # OS detection
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_NAME="${ID:-unknown}"
    OS_VERSION="${VERSION_ID:-unknown}"
  else
    OS_NAME="unknown"
    OS_VERSION="unknown"
  fi
  echo "  OS: ${OS_NAME} ${OS_VERSION}"
  case "$OS_NAME" in
    ubuntu|debian) ;;
    *) c_yellow "  This installer is tested on Ubuntu/Debian. Detected: ${OS_NAME}. Continuing anyway." ;;
  esac

  # Architecture
  ARCH="$(uname -m)"
  echo "  Architecture: ${ARCH}"

  # Root / sudo
  echo "  Root privileges: OK (running as $(id -un))"

  # RAM
  MEM_TOTAL_MB="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
  echo "  Available RAM: ${MEM_TOTAL_MB} MB"
  if [ "$MEM_TOTAL_MB" -gt 0 ] && [ "$MEM_TOTAL_MB" -lt 1500 ]; then
    c_yellow "  Warning: less than ~1.5GB RAM detected. Postgres + Redis + API + Web may struggle."
  fi

  # Disk
  DISK_AVAIL_GB="$(df -Pk "${INSTALL_DIR_PARENT:-/}" 2>/dev/null | awk 'NR==2 {printf "%d", $4/1024/1024}' || echo 0)"
  echo "  Available disk: ${DISK_AVAIL_GB} GB"
  if [ "$DISK_AVAIL_GB" -gt 0 ] && [ "$DISK_AVAIL_GB" -lt 2 ]; then
    fail "Only ${DISK_AVAIL_GB}GB free disk space — not enough to safely build/run Postgres + Redis + API + Web images. Free up space and re-run."
  elif [ "$DISK_AVAIL_GB" -gt 0 ] && [ "$DISK_AVAIL_GB" -lt 5 ]; then
    c_yellow "  Warning: less than 5GB free disk space."
  fi

  # Internet connectivity
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS --max-time 5 https://github.com >/dev/null 2>&1; then
      echo "  Internet connectivity: OK"
    else
      fail "No internet connectivity detected (could not reach github.com)."
    fi
  else
    c_yellow "  curl not found yet — will install it with base packages."
  fi

  log "System checks passed: OS=${OS_NAME} ${OS_VERSION}, ARCH=${ARCH}, RAM=${MEM_TOTAL_MB}MB, DISK=${DISK_AVAIL_GB}GB"
}

# ============================================================================
# Step 2: Docker checks / install
# ============================================================================
docker_checks() {
  step "Checking Docker..."

  local need_base_pkgs=0
  for cmd in curl git openssl; do
    command -v "$cmd" >/dev/null 2>&1 || need_base_pkgs=1
  done
  if [ "$need_base_pkgs" -eq 1 ]; then
    echo "  Installing base packages (curl, git, openssl, ca-certificates, gettext-base)..."
    apt-get update -qq
    apt-get install -y -qq curl git openssl ca-certificates gnupg gettext-base >/dev/null
  fi
  # gettext-base is required for envsubst used by scripts/render-nginx-prod.sh
  if ! command -v envsubst >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq gettext-base >/dev/null
  fi
  # openssl is required for JWT_SECRET / POSTGRES_PASSWORD generation
  # (gen_secret) — check explicitly rather than letting that fail later
  # with a confusing "command not found" deep inside secret generation.
  command -v openssl >/dev/null 2>&1 || fail "openssl is required but could not be installed. Install it manually (apt-get install openssl) and re-run."

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "  Docker already installed: $(docker --version)"
    echo "  Docker Compose already installed: $(docker compose version --short 2>/dev/null || docker compose version)"
    log "Docker already present, skipping install"
  else
    echo "  Docker not found (or Compose plugin missing) — installing Docker Engine..."
    # Official convenience script (Docker's documented install path for
    # Ubuntu/Debian). Installs Engine + the Compose v2 plugin together.
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh >/dev/null
    rm -f /tmp/get-docker.sh
    systemctl enable --now docker >/dev/null 2>&1 || service docker start >/dev/null 2>&1 || true
  fi

  command -v docker >/dev/null 2>&1 || fail "Docker installation failed — 'docker' command not found."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin not found after installation."

  echo "  Verified: $(docker --version)"
  echo "  Verified: $(docker compose version)"
  log "Docker OK: $(docker --version 2>/dev/null); Compose OK: $(docker compose version 2>/dev/null)"

  if ! docker info >/dev/null 2>&1; then
    fail "Docker daemon is not running/reachable. Try: systemctl start docker"
  fi
}

# ============================================================================
# Step 3: Get the repository into place (or detect existing installation)
# ============================================================================
EXISTING_INSTALL=0
prepare_install_dir() {
  step "Preparing installation..."

  read -r -p "Install directory [${DEFAULT_INSTALL_DIR}]: " INSTALL_DIR
  INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
  INSTALL_DIR_PARENT="$(dirname "$INSTALL_DIR")"

  if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/${COMPOSE_FILE}" ]; then
    EXISTING_INSTALL=1
    c_yellow "Existing Bot Hosting Panel installation detected at ${INSTALL_DIR}."
    echo "  1) Update"
    echo "  2) Repair (re-run install over the existing directory, .env kept)"
    echo "  3) Cancel"
    read -r -p "Choose an option [1-3]: " existing_choice
    case "$existing_choice" in
      1)
        if [ -x "${INSTALL_DIR}/update.sh" ]; then
          echo "Handing off to the existing update.sh (backs up, pulls, migrates, restarts, verifies)..."
          exec bash "${INSTALL_DIR}/update.sh"
        else
          fail "update.sh not found in ${INSTALL_DIR}. Cannot update automatically."
        fi
        ;;
      2)
        c_yellow "Repair mode: will re-render config and restart the stack without touching your .env or data."
        ;;
      *)
        echo "Cancelled. No changes made."
        exit 0
        ;;
    esac
  else
    mkdir -p "$INSTALL_DIR"
    if [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null || true)" ]; then
      fail "${INSTALL_DIR} exists and is not empty, and does not look like a Bot Hosting Panel install. Choose a different --dir or empty it first."
    fi

    if [ -f "./${COMPOSE_FILE}" ] && [ -f "./install.sh" ]; then
      # Running from an already-checked-out copy of the repo
      echo "Running from local repository checkout — copying into ${INSTALL_DIR}..."
      SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
      cp -a "${SRC_DIR}/." "$INSTALL_DIR/"
    else
      echo "Cloning ${REPO_URL} (${REPO_BRANCH}) into ${INSTALL_DIR}..."
      git clone --depth=1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR" \
        || fail "git clone failed. Check network access and repository URL/branch."
    fi
  fi

  cd "$INSTALL_DIR"
  [ -f "$COMPOSE_FILE" ] || fail "Cannot find ${COMPOSE_FILE} in ${INSTALL_DIR} — repository layout looks unexpected."
  chmod +x scripts/*.sh 2>/dev/null || true
  chmod +x update.sh 2>/dev/null || true
  log "Install directory ready: ${INSTALL_DIR} (existing_install=${EXISTING_INSTALL})"
}

# ============================================================================
# Step 4: Preflight validation — confirm the project is actually complete
# and buildable BEFORE we touch secrets, storage, or Docker. Catches a
# missing/renamed file with one clear message instead of a confusing
# failure three steps later.
# ============================================================================
preflight_checks() {
  step "Validating project files..."
  local missing=()
  local required_files=(
    "docker-compose.prod.yml"
    "backend/Dockerfile.prod"
    "backend/package.json"
    "backend/package-lock.json"
    "backend/prisma/schema.prisma"
    "frontend/Dockerfile.prod"
    "frontend/package.json"
    "frontend/package-lock.json"
    "nginx/nginx.prod.conf"
    "scripts/init.sh"
    "scripts/render-nginx-prod.sh"
  )
  for f in "${required_files[@]}"; do
    if [ ! -s "$f" ]; then
      missing+=("$f")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    fail "Required project file(s) missing or empty: ${missing[*]}. The repository checkout looks incomplete — re-clone and re-run."
  fi
  echo "  All required project files present."

  # .env.production.example is the template configure_env() copies from to
  # build .env. If it's missing, generate it safely from .env.example
  # instead of letting configure_env() write an incomplete/invalid .env
  # later — but never invent secret VALUES, only carry over variable NAMES.
  if [ ! -s ".env.production.example" ]; then
    if [ -s ".env.example" ]; then
      c_yellow "  .env.production.example is missing — generating it from .env.example."
      {
        echo "# Auto-generated by install.sh from .env.example on $(date '+%Y-%m-%d')."
        echo "# Review before relying on it for production — no secret values are set here,"
        echo "# install.sh fills in real generated secrets when it writes .env."
        echo
        cat ".env.example"
      } > ".env.production.example"
      log "Generated .env.production.example from .env.example (no secret values included)"
    else
      fail "Missing .env.production.example AND .env.example — cannot safely determine the required environment variables. Add one of these files to the repository and re-run."
    fi
  fi
  echo "  .env.production.example present."

  # Permission checks: root already required, but confirm we can actually
  # write where we need to, and that the Docker socket is usable — cheap to
  # check now, painful to discover mid-build.
  [ -w "$INSTALL_DIR" ] || fail "No write permission on ${INSTALL_DIR}. Fix ownership/permissions and re-run."
  if [ -e /var/run/docker.sock ] && [ ! -w /var/run/docker.sock ] && [ "$(id -u)" -ne 0 ]; then
    fail "No permission to access /var/run/docker.sock. Re-run as root."
  fi
  local log_dir
  log_dir="$(dirname "$LOG_FILE")"
  [ -w "$log_dir" ] || c_yellow "  Warning: ${log_dir} is not writable — falling back to a local log file."

  # Sanity-check the Dockerfiles aren't empty/corrupt (e.g. truncated by a
  # bad transfer) before we spend minutes on a build that can't succeed.
  for df in "backend/Dockerfile.prod" "frontend/Dockerfile.prod"; do
    grep -q "^FROM " "$df" || fail "${df} does not contain a FROM instruction — file looks corrupt or truncated."
  done
  echo "  Dockerfiles look structurally valid."

  log "Preflight checks passed"
}

# ============================================================================
# Step 5: Interactive configuration + .env generation
# ============================================================================
gen_secret() { openssl rand -hex 32; }

# ----------------------------------------------------------------------------
# Safely load KEY="value" pairs from a .env file into the current shell's
# environment WITHOUT ever passing the file's content through `source`/`eval`.
# `source`-ing a .env file is dangerous: values are re-parsed as bash syntax,
# so a value containing <, >, $, `, &, or unquoted spaces can redirect
# input/output, run commands, or otherwise misbehave. This function instead
# splits each line on the first "=" and strips at most one matching pair of
# surrounding quotes, verbatim — the same rule Docker Compose itself uses
# when reading .env for its own ${VAR} substitution, so both stay in sync.
# ----------------------------------------------------------------------------
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

# Reject characters that can't safely round-trip through the quoted .env
# format above (or through Docker Compose's own .env parser) instead of
# silently mis-parsing them later. Realistic passwords/values essentially
# never need these characters.
validate_safe_value() {
  local label="$1" val="$2"
  case "$val" in
    *'"'*|*'`'*|*$'\n'*)
      c_red "${label} can't contain a double quote, backtick, or newline. Please try again."
      return 1
      ;;
  esac
  return 0
}

configure_env() {
  step "Configuring environment..."

  if [ -f ".env" ] && [ "$EXISTING_INSTALL" -eq 1 ]; then
    c_yellow ".env already exists — reusing it as-is (repair mode never overwrites config)."
    load_env "./.env"
    ADMIN_EMAIL="${ADMIN_EMAIL:-}"
    return
  fi

  if [ -f ".env" ]; then
    c_yellow "A .env file already exists in ${INSTALL_DIR}."
    read -r -p "Overwrite it with new answers? [y/N]: " overwrite
    if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
      echo "Keeping existing .env unchanged."
      load_env "./.env"
      return
    fi
    cp ./.env "./.env.bak.$(date +%Y%m%d-%H%M%S)"
  fi

  echo
  c_bold "Panel configuration"
  read -r -p "Panel domain (e.g. botpanel.example.com): " DOMAIN
  [ -n "$DOMAIN" ] || fail "A domain is required."

  read -r -p "Admin email (e.g. admin@example.com): " ADMIN_EMAIL
  [ -n "$ADMIN_EMAIL" ] || fail "An admin email is required."

  while true; do
    read -r -s -p "Admin password: " ADMIN_PASSWORD; echo
    read -r -s -p "Confirm admin password: " ADMIN_PASSWORD_CONFIRM; echo
    if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
      c_red "Passwords do not match. Try again."
      continue
    fi
    if [ "${#ADMIN_PASSWORD}" -lt 8 ]; then
      c_red "Password must be at least 8 characters. Try again."
      continue
    fi
    validate_safe_value "Admin password" "$ADMIN_PASSWORD" || continue
    break
  done

  echo
  c_bold "Email / OTP (SMTP)"
  read -r -p "Do you want SMTP email/OTP support? [Y/n]: " want_smtp
  want_smtp="${want_smtp:-Y}"
  SMTP_HOST=""; SMTP_PORT="587"; SMTP_SECURE="false"; SMTP_USER=""; SMTP_PASS=""
  MAIL_FROM_NAME="Bot Hosting Platform"; MAIL_FROM="no-reply@localhost"
  if [[ "$want_smtp" =~ ^[Yy]$ ]]; then
    read -r -p "SMTP_HOST: " SMTP_HOST
    read -r -p "SMTP_PORT [587]: " SMTP_PORT_IN; SMTP_PORT="${SMTP_PORT_IN:-587}"
    read -r -p "SMTP_SECURE (true/false) [false]: " SMTP_SECURE_IN; SMTP_SECURE="${SMTP_SECURE_IN:-false}"
    read -r -p "SMTP_USER: " SMTP_USER
    while true; do
      read -r -s -p "SMTP_PASS: " SMTP_PASS; echo
      validate_safe_value "SMTP password" "$SMTP_PASS" && break
    done
    read -r -p "Sender display name [Bot Hosting Platform]: " MAIL_FROM_NAME_IN
    MAIL_FROM_NAME="${MAIL_FROM_NAME_IN:-Bot Hosting Platform}"
    # MAIL_FROM_NAME and MAIL_FROM are two separate fields in the app
    # (backend/src/common/mail/mail.service.ts builds "Name <email>" from
    # them itself) — MAIL_FROM must be a bare address, never "Name <email>"
    # combined, or outgoing mail headers end up double-wrapped and broken.
    while true; do
      read -r -p "Sender email address [${ADMIN_EMAIL}]: " MAIL_FROM_IN
      MAIL_FROM="${MAIL_FROM_IN:-$ADMIN_EMAIL}"
      case "$MAIL_FROM" in
        *'<'*|*'>'*)
          c_red "Enter a plain email address only (no display name / angle brackets) — you already set the display name above."
          continue
          ;;
      esac
      case "$MAIL_FROM" in
        *@*.*) break ;;
        *) c_red "That doesn't look like a valid email address. Try again." ;;
      esac
    done
  else
    echo "  Skipping SMTP setup — leaving SMTP_HOST empty. Per the project's existing"
    echo "  fallback behavior, emails will be logged to the API console instead of sent."
  fi

  echo
  c_bold "SSL (Let's Encrypt)"
  read -r -p "Let's Encrypt email [${ADMIN_EMAIL}]: " LETSENCRYPT_EMAIL_IN
  LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL_IN:-$ADMIN_EMAIL}"

  echo
  c_bold "Security"
  echo "  Generating JWT_SECRET and POSTGRES_PASSWORD with openssl rand -hex 32..."
  JWT_SECRET="$(gen_secret)"
  POSTGRES_PASSWORD="$(gen_secret)"

  DOCKER_GID="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo 999)"

  # Use .env.production.example as the source of truth for variable names,
  # so we never invent keys the project doesn't already define.
  [ -f ".env.production.example" ] || fail "Missing .env.production.example — cannot safely generate .env."
  cp ".env.production.example" ".env"

  # Always write values wrapped in double quotes instead of bare/unescaped
  # text. This is deliberate, not cosmetic: scripts/init.sh and
  # scripts/render-nginx-prod.sh both read this file, and a bare value
  # containing spaces, <, >, $, `, &, or | can otherwise be misinterpreted
  # as shell syntax. Docker Compose's own .env parser also understands
  # double-quoted values (stripping exactly one matching pair), so this
  # format is safe for both consumers. validate_safe_value() above already
  # rejects the one class of character (an embedded ") that this quoting
  # scheme can't itself round-trip.
  set_env() {
    local key="$1" val="$2"
    grep -q "^${key}=" ".env" && sed -i "/^${key}=/d" ".env"
    printf '%s="%s"\n' "$key" "$val" >> ".env"
  }

  set_env "SERVER_NAME" "$DOMAIN"
  set_env "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
  set_env "JWT_SECRET" "$JWT_SECRET"
  set_env "NEXT_PUBLIC_API_URL" "https://${DOMAIN}/api"
  set_env "NEXT_PUBLIC_WS_URL" "wss://${DOMAIN}"
  set_env "CORS_ORIGIN" "https://${DOMAIN}"
  set_env "FRONTEND_URL" "https://${DOMAIN}"
  set_env "ADMIN_EMAIL" "$ADMIN_EMAIL"
  set_env "ADMIN_PASSWORD" "$ADMIN_PASSWORD"
  set_env "SMTP_HOST" "$SMTP_HOST"
  set_env "SMTP_PORT" "$SMTP_PORT"
  set_env "SMTP_SECURE" "$SMTP_SECURE"
  set_env "SMTP_USER" "$SMTP_USER"
  set_env "SMTP_PASS" "$SMTP_PASS"
  set_env "MAIL_FROM_NAME" "$MAIL_FROM_NAME"
  set_env "MAIL_FROM" "$MAIL_FROM"
  set_env "DOCKER_GID" "$DOCKER_GID"
  set_env "LETSENCRYPT_EMAIL" "$LETSENCRYPT_EMAIL"

  chmod 600 ".env"
  echo "  .env written (permissions 600). No secrets were printed above."
  log ".env generated for domain=${DOMAIN}, admin_email=${ADMIN_EMAIL} (values not logged)"
}

# ============================================================================
# Step 6: Storage init
# ============================================================================
init_storage() {
  step "Initializing storage..."
  [ -x "scripts/init.sh" ] || chmod +x scripts/init.sh
  ./scripts/init.sh
}

# ============================================================================
# Step 7: Render Nginx
# ============================================================================
render_nginx() {
  step "Rendering Nginx..."
  [ -x "scripts/render-nginx-prod.sh" ] || chmod +x scripts/render-nginx-prod.sh
  ./scripts/render-nginx-prod.sh
}

# ============================================================================
# Step 8: Build images (self-healing: diagnose -> remediate -> retry)
# ============================================================================
MAX_BUILD_RETRIES=2   # total attempts = 1 + this, so the loop can't run forever
BUILD_LOG_DIR="/var/log/bot-hosting-panel-build-logs"

# Ensure a Node.js/npm toolchain exists on the HOST so we can safely
# regenerate a lockfile with `npm install --package-lock-only`. This never
# installs project dependencies on the host and never touches node_modules
# — it only recomputes package-lock.json from package.json.
ensure_node_npm() {
  if command -v npm >/dev/null 2>&1; then
    return 0
  fi
  c_yellow "  npm not found on host — installing Node.js LTS (needed only to repair package-lock.json)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 \
    && apt-get install -y -qq nodejs >/dev/null 2>&1
  command -v npm >/dev/null 2>&1
}

# Regenerate package-lock.json so it matches package.json, without touching
# node_modules or installing anything into the project. Always backs up the
# existing lock file first (never blindly deletes it).
remediate_lockfile_sync() {
  local dir="$1"
  [ -f "${dir}/package.json" ] || return 1
  ensure_node_npm || { c_yellow "  Could not install npm on host — skipping lockfile repair for ${dir}."; return 1; }

  local backup="${dir}/package-lock.json.bak.$(date +%Y%m%d-%H%M%S)"
  if [ -f "${dir}/package-lock.json" ]; then
    cp "${dir}/package-lock.json" "$backup"
    echo "  Backed up ${dir}/package-lock.json -> ${backup}"
  fi

  echo "  Regenerating ${dir}/package-lock.json from ${dir}/package.json (package-lock-only, no install)..."
  ( cd "$dir" && npm install --package-lock-only --no-audit --no-fund ) \
    || { c_yellow "  Lockfile regeneration failed for ${dir}."; return 1; }

  echo "  ${dir}/package-lock.json is now in sync with package.json."
  return 0
}

# Look at a captured build log and classify the failure. Echoes one of:
# lockfile_sync | network | prisma | disk_space | permission | unknown
diagnose_build_failure() {
  local log_file="$1"
  if grep -qiE "npm (ci|install).*(can only install|in sync|EUSAGE)|lock file.*out of sync|npm error code EUSAGE" "$log_file" 2>/dev/null; then
    echo "lockfile_sync"
  elif grep -qiE "no space left on device|ENOSPC" "$log_file" 2>/dev/null; then
    echo "disk_space"
  elif grep -qiE "permission denied|EACCES" "$log_file" 2>/dev/null; then
    echo "permission"
  elif grep -qiE "ENOTFOUND registry|ETIMEDOUT|network.*(timeout|unreachable)|getaddrinfo|E403|429 Too Many Requests" "$log_file" 2>/dev/null; then
    echo "network"
  elif grep -qiE "prisma (generate|migrate).*(error|failed)|Error: P[0-9]{4}" "$log_file" 2>/dev/null; then
    echo "prisma"
  else
    echo "unknown"
  fi
}

# Pull out the handful of lines that actually matter from a build log —
# npm/tsc/prisma error lines — instead of dumping the whole log or just a
# blind tail. Falls back to the tail if nothing matches so we never print
# nothing.
extract_root_error() {
  local log_file="$1"
  local hits
  hits="$(grep -inE "npm error|npm ERR!|error TS[0-9]+|Error: P[0-9]{4}|failed to solve|ERROR \[" "$log_file" 2>/dev/null | tail -n 25)"
  if [ -n "$hits" ]; then
    echo "$hits"
  else
    tail -n 25 "$log_file"
  fi
}

# Validate docker-compose.prod.yml (syntax + required-variable interpolation
# via .env) before spending minutes on an image build that can never
# succeed. This is deliberately run AFTER configure_env writes .env, since
# the compose file uses ${VAR:?...} for required variables.
validate_compose_config() {
  local out
  if out="$(docker compose -f "$COMPOSE_FILE" config --quiet 2>&1)"; then
    return 0
  fi
  c_red "  docker-compose.prod.yml failed validation:"
  echo "$out" | sed 's/^/    /'
  local missing_var
  missing_var="$(echo "$out" | grep -oE '[A-Z_]+ must be set' | head -1)"
  if [ -n "$missing_var" ]; then
    fail "docker-compose.prod.yml requires ${missing_var} but it isn't set in .env. Check .env was written correctly (see step 5) and re-run."
  fi
  fail "docker-compose.prod.yml is invalid — see the error above. Fix the compose file and re-run."
}

build_images() {
  step "Building Docker images..."
  local build_step="$STEP_NUM"
  mkdir -p "$BUILD_LOG_DIR" 2>/dev/null || BUILD_LOG_DIR="./build-logs"
  mkdir -p "$BUILD_LOG_DIR" 2>/dev/null || true

  echo "  Validating docker-compose.prod.yml..."
  validate_compose_config
  echo "  Compose config OK."

  local attempt=0
  while :; do
    attempt=$((attempt + 1))
    local build_log="${BUILD_LOG_DIR}/build-attempt-${attempt}-$(date +%Y%m%d-%H%M%S).log"
    local build_args=()
    # A previous failed attempt may have left bad layers cached (e.g. an
    # npm install that failed partway through). Force a clean rebuild on
    # retries rather than reaching for `docker system prune -a` (which
    # would nuke unrelated images/containers on the host).
    [ "$attempt" -gt 1 ] && build_args+=(--no-cache)

    echo "  Attempt ${attempt}/$((MAX_BUILD_RETRIES + 1)): docker compose build ${build_args[*]} api web"
    # Secrets never touch the build log: `docker compose build` output here
    # is npm/tsc/docker layer output only, not .env content.
    if docker compose -f "$COMPOSE_FILE" build "${build_args[@]}" api web >"$build_log" 2>&1; then
      echo "  Build succeeded."
      log "Docker build succeeded on attempt ${attempt}"
      return 0
    fi

    c_yellow "  [${build_step}/${TOTAL_STEPS}] Build failed — diagnosing (log: ${build_log})..."
    log "Docker build failed on attempt ${attempt}, log=${build_log}"
    local reason
    reason="$(diagnose_build_failure "$build_log")"
    echo "  Diagnosis: ${reason}"
    echo "  Relevant error output:"
    extract_root_error "$build_log" | sed 's/^/    /'

    if [ "$attempt" -gt "$MAX_BUILD_RETRIES" ]; then
      c_red "  Maximum build retries (${MAX_BUILD_RETRIES}) reached."
      fail "Docker image build failed after ${attempt} attempts (reason: ${reason}). Full log: ${build_log}. See the exact error lines printed above. Manual fix: for 'lockfile_sync', run 'npm install --package-lock-only' in backend/ (and frontend/ if affected); for 'disk_space', free up disk and re-run; for 'permission', fix ownership on the install directory and re-run; for 'network', check outbound access to registry.npmjs.org and re-run; otherwise the error lines above point at the exact command/file responsible."
    fi

    case "$reason" in
      lockfile_sync)
        c_yellow "  [${build_step}/${TOTAL_STEPS}] Applying safe remediation: regenerating out-of-sync package-lock.json..."
        local fixed=0
        remediate_lockfile_sync "${INSTALL_DIR}/backend" && fixed=1
        remediate_lockfile_sync "${INSTALL_DIR}/frontend" && fixed=1
        if [ "$fixed" -eq 0 ]; then
          fail "Detected a package.json/package-lock.json mismatch but could not repair it automatically (no npm available and none could be installed). Full log: ${build_log}. Manual fix: install Node.js, then run 'npm install --package-lock-only' in backend/ (and frontend/ if affected), then re-run this installer."
        fi
        ;;
      network)
        c_yellow "  [${build_step}/${TOTAL_STEPS}] Looks like a registry/network hiccup — verifying connectivity and retrying..."
        curl -fsS --max-time 5 https://registry.npmjs.org/ >/dev/null 2>&1 \
          || c_yellow "  Warning: registry.npmjs.org still not reachable from this host."
        sleep 5
        ;;
      disk_space)
        c_yellow "  [${build_step}/${TOTAL_STEPS}] Out of disk space — clearing dangling Docker build cache (not a full system prune)..."
        docker builder prune --force >/dev/null 2>&1 || true
        df -Pk "$INSTALL_DIR" 2>/dev/null | awk 'NR==2 {printf "  %.1fGB free after cleanup\n", $4/1024/1024}'
        ;;
      permission)
        fail "A permission error occurred during the build (see the lines above for the exact file/path). This usually means files in ${INSTALL_DIR} aren't owned correctly. Manual fix: 'chown -R root:root ${INSTALL_DIR}' then re-run."
        ;;
      prisma)
        fail "Prisma generate/migrate failed during the build (not something the installer can safely auto-repair — it usually means the Prisma schema and a migration are out of sync). Full log: ${build_log}. Manual fix: review backend/prisma/schema.prisma and backend/prisma/migrations, then re-run."
        ;;
      unknown)
        fail "Docker image build failed for an unrecognized reason — not auto-repairing to avoid masking a real bug. Full log: ${build_log}. The error lines above point at the exact command/file responsible."
        ;;
    esac

    c_yellow "  [${build_step}/${TOTAL_STEPS}] Retrying Docker build..."
    log "Retrying Docker build after ${reason} remediation (attempt $((attempt + 1)) next)"
  done
}

# ============================================================================
# Step 9: Start services (+ first-cert bootstrap dance)
# ============================================================================
start_services() {
  step "Starting services..."

  # Bring up everything except we need certs to exist before nginx's HTTPS
  # block can start. Follow DEPLOYMENT.md's documented bootstrap sequence:
  # start core services + nginx (HTTP works, HTTPS block will fail to bind
  # without certs), issue the cert, then reload/restart nginx.
  CERTS_EXIST=0
  if docker volume inspect "$(basename "$INSTALL_DIR")_certbot_certs" >/dev/null 2>&1; then
    if docker run --rm -v "$(basename "$INSTALL_DIR")_certbot_certs:/etc/letsencrypt" alpine \
         sh -c "[ -f /etc/letsencrypt/live/${DOMAIN:-x}/fullchain.pem ]" >/dev/null 2>&1; then
      CERTS_EXIST=1
    fi
  fi

  if [ "$CERTS_EXIST" -eq 0 ]; then
    c_yellow "  No existing certificate found — starting Nginx with a minimal HTTP-only"
    c_yellow "  bootstrap config (port 80, ACME challenge only) so a certificate can be"
    c_yellow "  issued before the real HTTPS config is rendered (per DEPLOYMENT.md)."

    # Write a standalone bootstrap config directly to the *rendered* file that
    # docker-compose.prod.yml mounts. This never touches the real
    # nginx/nginx.prod.conf template, so there's nothing to restore afterward
    # beyond re-rendering the template as normal.
    mkdir -p nginx
    cat > nginx/nginx.prod.rendered.conf <<EOF
worker_processes auto;
events { worker_connections 1024; }
http {
  server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'Bot Hosting Panel is bootstrapping SSL, please wait...'; add_header Content-Type text/plain; }
  }
}
EOF

    docker compose -f "$COMPOSE_FILE" up -d postgres redis api web nginx \
      || fail "Failed to start core services for certificate bootstrap."

    echo "  Waiting for API to become healthy before requesting a certificate..."
    sleep 10

    echo "  Requesting Let's Encrypt certificate for ${DOMAIN}..."
    docker compose -f "$COMPOSE_FILE" run --rm certbot \
      certonly --webroot -w /var/www/certbot \
      -d "$DOMAIN" \
      --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email \
      || fail "Let's Encrypt certificate issuance failed. Ensure ${DOMAIN} points to this server's public IP and ports 80/443 are reachable from the internet, then re-run this installer."

    echo "  Rendering the real HTTPS Nginx config now that a certificate exists..."
    ./scripts/render-nginx-prod.sh
  else
    echo "  Existing certificate found for ${DOMAIN} — skipping first-issuance flow."
  fi

  docker compose -f "$COMPOSE_FILE" up -d --build \
    || fail "docker compose up failed. Check 'docker compose -f ${COMPOSE_FILE} logs'."
}

# ============================================================================
# Step 10: Migrations
# ============================================================================
run_migrations() {
  step "Running database migrations..."
  # Wait for postgres to report healthy before migrating.
  local tries=0
  until docker compose -f "$COMPOSE_FILE" ps postgres --format '{{.Status}}' 2>/dev/null | grep -qi healthy; do
    tries=$((tries + 1))
    [ "$tries" -gt 30 ] && fail "Postgres did not become healthy in time."
    sleep 2
  done
  docker compose -f "$COMPOSE_FILE" exec -T api npm run prisma:migrate \
    || fail "Prisma migration failed. Your data was not touched by this step."
}

# ============================================================================
# Step 11: Admin seed
# ============================================================================
seed_admin() {
  step "Creating admin account..."
  # NOT `npm run seed` — that runs ts-node, which is a devDependency and
  # isn't installed in the production image (Dockerfile.prod's runner stage
  # only installs `--omit=dev`). `seed:prod` runs the plain-JS build of
  # prisma/seed.ts that Dockerfile.prod compiles ahead of time instead.
  docker compose -f "$COMPOSE_FILE" exec -T api npm run seed:prod \
    || fail "Admin seed failed. Check 'docker compose -f ${COMPOSE_FILE} logs api'."
}

# ============================================================================
# Step 12: Health check
# ============================================================================
HEALTH_OK=1
health_check() {
  step "Checking health..."
  local svc_ok=1

  echo "  Docker Compose services:"
  for svc in postgres redis api web nginx; do
    local status
    status="$(docker compose -f "$COMPOSE_FILE" ps "$svc" --format '{{.Status}}' 2>/dev/null || echo missing)"
    if echo "$status" | grep -qi "healthy\|running\|up"; then
      echo "  ✓ ${svc}: ${status}"
    else
      c_red "  ✗ ${svc}: ${status}"
      svc_ok=0
    fi
  done

  echo "  Docker images:"
  docker compose -f "$COMPOSE_FILE" images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | sed 's/^/    /' || true

  local api_ok=0
  if docker compose -f "$COMPOSE_FILE" exec -T api wget -qO- http://localhost:4000/api/health/ready >/dev/null 2>&1; then
    api_ok=1
    echo "  ✓ /api/health/ready responded"
  else
    c_yellow "  ! /api/health/ready did not respond yet (services may still be warming up)"
  fi

  local redis_ok=0
  if docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping 2>/dev/null | grep -qi PONG; then
    redis_ok=1
    echo "  ✓ Redis responded to PING"
  else
    c_yellow "  ! Redis did not respond to PING"
    svc_ok=0
  fi

  local pg_ok=0
  if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready >/dev/null 2>&1; then
    pg_ok=1
    echo "  ✓ Postgres accepting connections (pg_isready)"
  else
    c_yellow "  ! Postgres not accepting connections yet"
    svc_ok=0
  fi

  local migrate_ok=0
  if docker compose -f "$COMPOSE_FILE" exec -T api npx prisma migrate status 2>&1 | grep -qi "up to date\|no pending migrations"; then
    migrate_ok=1
    echo "  ✓ Prisma migrations up to date"
  else
    c_yellow "  ! Prisma migration status could not be confirmed (see 'panel logs api')"
  fi

  echo "  Exposed ports (host):"
  for port in 80 443; do
    if ss -tln 2>/dev/null | grep -q ":${port} "; then
      echo "  ✓ port ${port} listening"
    else
      c_yellow "  ! port ${port} not listening yet"
    fi
  done

  local https_ok=0
  if curl -fsS --max-time 10 "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    https_ok=1
    echo "  ✓ https://${DOMAIN}/api/health reachable"
  else
    c_yellow "  ! Could not reach https://${DOMAIN}/api/health from this host yet (DNS propagation can take a few minutes)"
  fi

  if [ "$svc_ok" -eq 0 ] || [ "$api_ok" -eq 0 ] || [ "$pg_ok" -eq 0 ] || [ "$redis_ok" -eq 0 ]; then
    HEALTH_OK=0
  fi
  [ "$https_ok" -eq 1 ] && SSL_STATUS_OK=1 || SSL_STATUS_OK=0
  log "Health check: svc_ok=${svc_ok} api_ok=${api_ok} pg_ok=${pg_ok} redis_ok=${redis_ok} migrate_ok=${migrate_ok} https_ok=${https_ok}"
}

# ============================================================================
# Step 13: Management command + summary
# ============================================================================
install_panel_command() {
  cat > /usr/local/bin/panel <<EOF
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${INSTALL_DIR}"
cd "\$APP_DIR"
case "\${1:-}" in
  status)   docker compose -f ${COMPOSE_FILE} ps ;;
  restart)  docker compose -f ${COMPOSE_FILE} restart ;;
  update)   bash "\$APP_DIR/update.sh" "\${@:2}" ;;
  logs)     docker compose -f ${COMPOSE_FILE} logs -f --tail=200 "\${@:2}" ;;
  backup)   bash "\$APP_DIR/update.sh" --list-backups ;;
  uninstall)
    read -r -p "This stops the panel. Remove containers/images too but KEEP your data (DB volumes, SERVERS_ROOT, BACKUPS_ROOT)? [y/N] " c
    if [[ "\$c" =~ ^[Yy]\$ ]]; then
      docker compose -f ${COMPOSE_FILE} down
      echo "Stopped. Data volumes and SERVERS_ROOT/BACKUPS_ROOT were left untouched."
    fi
    ;;
  *) echo "Usage: panel {status|restart|update|logs|backup|uninstall}" ;;
esac
EOF
  chmod +x /usr/local/bin/panel
}

print_summary() {
  step "Finishing up..."
  echo
  echo "========================================"
  if [ "$HEALTH_OK" -eq 1 ]; then
    echo "       INSTALLATION COMPLETE — SUCCESS"
  else
    echo "   INSTALLATION FINISHED WITH WARNINGS"
  fi
  echo "========================================"
  echo
  echo "Panel:"
  echo "  https://${DOMAIN}"
  echo
  echo "Admin:"
  echo "  ${ADMIN_EMAIL}"
  echo
  echo "Services:"
  docker compose -f "$COMPOSE_FILE" ps --format '{{.Names}}: {{.Status}}' 2>/dev/null | sed 's/^/  /'
  echo "  SSL: $([ "${SSL_STATUS_OK:-0}" -eq 1 ] && echo OK || echo "check manually — see INSTALLER.md troubleshooting")"
  echo
  echo "Management command installed: panel {status|restart|update|logs|backup|uninstall}"
  echo "Install directory: ${INSTALL_DIR}"
  echo "Install log: ${LOG_FILE}"
  echo
  if [ "$HEALTH_OK" -eq 0 ]; then
    c_yellow "NOT all health checks passed — this is not being reported as a clean success."
    c_yellow "This is often just services still warming up. Check again in a minute with:"
    c_yellow "  panel status   and   panel logs <service>"
    c_yellow "If it's still failing after a couple of minutes, re-run this installer and"
    c_yellow "choose 'Repair' — that reuses your existing .env and retries build/migrate/seed."
  else
    c_green "SUCCESS — all health checks passed (containers running, API/DB/Redis reachable, migrations applied)."
  fi
  log "Installation finished. health_ok=${HEALTH_OK} ssl_ok=${SSL_STATUS_OK:-0}"
}

# ============================================================================
# Main
# ============================================================================
main() {
  banner
  require_root
  touch "$LOG_FILE" 2>/dev/null || LOG_FILE="./bot-hosting-panel-install.log"
  log "Installer started"

  system_checks
  docker_checks
  prepare_install_dir
  preflight_checks
  configure_env
  init_storage
  render_nginx
  build_images
  start_services
  run_migrations
  seed_admin
  health_check
  install_panel_command
  print_summary
}

main "$@"
