# Security

## Reporting a vulnerability

If you find a security issue, please report it privately rather than opening
a public GitHub issue — open a GitHub Security Advisory on this repository
(`Security` tab → `Report a vulnerability`), or email the maintainer listed
in the repository's contact info. Include steps to reproduce and the
potential impact. Please allow a reasonable window to address the issue
before public disclosure.

## Threat model

This platform lets untrusted (or semi-trusted) users upload arbitrary code
and run it in a container that the API itself controls via the Docker
socket. The main risks it defends against:

- **A logged-in user escaping their own bot's container** to reach the host
  or other users' data.
- **A logged-in user reading/writing another user's files** through the
  file-manager or backup APIs.
- **Path traversal / zip-slip** during file upload, ZIP extraction, or backup
  restore.
- **Credential stuffing / brute force** against login and password-reset
  endpoints.
- **A compromised API process gaining full host control** through the
  mounted Docker socket.

## What's already implemented

- **Per-container resource limits**: every bot container gets `Memory`,
  `MemorySwap`, `CpuQuota`, and `PidsLimit` derived from the owning user's
  quota (`backend/src/docker/docker.service.ts`), preventing one bot from
  starving the host or other bots.
- **Path-traversal protection**: all file-manager operations resolve
  through `FilesService.resolvePath()`, which normalizes the path and
  rejects anything that escapes the server's root directory
  (`backend/src/files/files.service.ts`).
- **Zip-slip protection**: ZIP extraction (upload-zip and backup restore)
  checks every entry's resolved path stays inside the target directory
  before writing it.
- **Auth hardening**: passwords hashed with `bcrypt`; JWT-based sessions
  with a `sessionVersion` counter so "log out everywhere" actually
  invalidates existing tokens; email verification and password-reset flows
  use single-use, hashed, expiring tokens (never the raw token stored at
  rest).
- **Rate limiting**: global throttling via `@nestjs/throttler`, with
  stricter per-route limits on `/api/auth/*` (login: 8/min, register: 5/min,
  forgot-password: 3/min, etc. — see `auth.controller.ts`).
- **Input validation**: a global `ValidationPipe` with `whitelist: true` and
  `forbidNonWhitelisted: true` strips/rejects any field not declared on a
  DTO, which also blocks basic mass-assignment payloads.
- **Security headers**: `helmet` is applied API-wide; the frontend sets its
  own CSP via `next.config.js`.
- **Role-based access control**: `RolesGuard` + `@Roles()` decorator gate
  admin-only endpoints; ownership checks (`userId` match, or admin) gate
  per-resource endpoints like servers/files/backups.
- **Non-root production containers**: `Dockerfile.prod` for both services
  runs as an unprivileged user, and the API container's Docker-group GID is
  configurable (`DOCKER_GID`) rather than defaulting to root.
- **Reduced attack surface in prod**: `docker-compose.prod.yml` only
  publishes ports on the `nginx` service; `api` and `web` are reachable only
  on the internal Docker network.
- **Automated dependency + code scanning**: Dependabot
  (`.github/dependabot.yml`), CodeQL (`.github/workflows/codeql.yml`), and a
  dedicated `security-scan.yml` workflow run in CI.

## Known limitations / recommended further hardening

These are documented trade-offs of a reference implementation, not silent
gaps — read this before exposing the platform to the public internet:

- **The API has full access to the host's Docker socket.** A compromised
  API process (e.g. via an unpatched dependency RCE) can control every
  container on the host, not just bot containers. For a stronger boundary,
  put a socket proxy such as `tecnativa/docker-socket-proxy` between the API
  and the real socket, scoped to only the Docker API calls the app actually
  uses (create/start/stop/stats/logs on containers with a specific label).
- **Bot containers share the kernel with the host** (standard Docker
  isolation, not gVisor/Kata/Firecracker). If you need stronger isolation
  between mutually-untrusted tenants, consider a sandboxed container
  runtime.
- **No built-in WAF/DDoS protection** beyond the app-level rate limiter —
  put a CDN or upstream WAF in front for internet-facing deployments.
- **Secrets in `.env`**: fine for a single-host deployment; for larger
  deployments, move `JWT_SECRET`, `POSTGRES_PASSWORD`, and `SMTP_PASS` into
  a proper secret manager and inject them at runtime instead.
- **No 2FA/MFA** on user accounts currently.
- **No CSRF token** on state-changing REST endpoints — mitigated by the API
  requiring a `Bearer` JWT (not a cookie) for authenticated requests, so a
  third-party site can't trigger authenticated calls via a simple form
  submission, but keep this in mind if you change the auth transport.

## Responsible use

This software gives arbitrary code execution to anyone who can create an
account and upload a bot. Only deploy it for users you're willing to grant
that level of trust to, and keep quotas conservative for public-facing
instances.
