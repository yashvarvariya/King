# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — Phase 7: PWA Support
- `frontend/public/manifest.json` — web app manifest (name, icons, standalone
  display, dark theme/background colors).
- `frontend/public/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png` — generated to precisely
  match the existing `favicon.svg` mark (same colors, same chevron+line
  glyph), not a generic placeholder icon. No new external image asset
  or dependency introduced.
- `frontend/public/sw.js` — service worker. Cache-first for hashed
  `/_next/static/*` build assets, network-first-with-cache-fallback for
  page navigations, offline.html as the last resort. **Never intercepts
  or caches `/api/*`** — see REVIEW.md for why that's a hard rule, not a
  detail.
- `frontend/public/offline.html` — plain static offline fallback page
  (intentionally has zero JS/Next.js dependency, so it still renders even
  if nothing else is cached).
- `frontend/src/components/PwaRegister.tsx` (new) — registers the service
  worker; mounted globally in `layout.tsx`.
- `frontend/src/components/InstallPrompt.tsx` (new) — custom "Add to Home
  Screen" banner using the `beforeinstallprompt` event, styled to match
  the app rather than each browser's default UI. Dismissible, remembers
  dismissal, hidden on auth-flow pages and once already installed.
- `frontend/src/app/layout.tsx` — added `manifest`, `appleWebApp`, and a
  `viewport` export (`themeColor`) to the root metadata; mounted
  `PwaRegister` and `InstallPrompt`.
- `frontend/next.config.js` — `Cache-Control: no-cache` +
  `Service-Worker-Allowed: /` headers on `/sw.js`, so browsers always
  fetch the latest service worker instead of a stale cached copy.

### Added — Phase 6: User Profile & Account Settings
- `PATCH /api/users/me/username` — change username (uniqueness-checked,
  same validation pattern as registration). No re-auth required; username
  isn't encoded in the JWT, so the caller's session is unaffected.
- `POST /api/users/me/email/request-change` + `POST /api/users/me/email/confirm-change`
  — two-step email change. The new address is only written to `User.email`
  once its ownership is proven via a 6-digit OTP sent to *that* address
  (mirrors the existing register/verify-email OTP mechanism). Requires the
  current password to start. Sends a security notice to the *old* address
  once the change is confirmed.
- **Change Password** and **Logout All Devices** were already fully
  implemented (`POST /api/auth/change-password`, `POST /api/auth/logout-all`,
  and `frontend/src/app/dashboard/account/page.tsx`) prior to this phase —
  left untouched, just extended the same page with the two new sections
  above.
- New Prisma migration `20250501000000_account_settings`: adds
  `User.pendingEmail` (nullable) and the `EMAIL_CHANGE` value to the
  `OtpPurpose` enum.
- Two new admin-editable email templates (`email_change_otp`,
  `email_changed`), seeded with sensible defaults alongside the existing
  transactional templates.

### Added — Phase 5: Landing Page
- Full public homepage (`frontend/src/app/page.tsx`) rebuilt from the
  QuantaForge-Panel feature source's design, ported into the existing
  NestJS/Next.js/Tailwind architecture and dark "signal-green" theme —
  no new frontend framework or styling system introduced.
  - Animated hero, live platform stats, dynamic pricing carousel,
    supported-runtimes grid, "Why choose QuantaForge", server locations,
    customer reviews, FAQ accordion, and a Discord CTA section.
  - New reusable landing components under `frontend/src/components/landing/`.
- `GET /api/stats` (`backend/src/stats/`) — new public, unauthenticated
  endpoint returning `totalUsers`, `totalServers`, `activeDeployments`, and
  a documented (not live-measured) `uptimePercent`. Kept separate from the
  existing admin-only `GET /api/admin/stats`, which is authenticated and
  returns business-sensitive breakdowns that don't belong on a public page.
- `GET /api/runtimes` (catalog route) is now public/unauthenticated —
  moved `@UseGuards(JwtAuthGuard)` from the controller class down to the
  individual routes that still need it (`GET /runtimes/:id` and all
  `/runtimes/admin/*` routes), mirroring the pattern the Plans controller
  already used. No behavior change for existing authenticated callers.
- `frontend/src/app/terms`, `/privacy`, `/status` — new pages linked from
  the landing footer. `/status` calls the existing `GET /api/health` and
  `GET /api/health/ready` endpoints rather than fabricating uptime data.
- Global `Footer` component now renders a full marketing footer
  (Product/Legal/Community columns) only on `/`; every other page keeps
  its original single-row footer unchanged.
- `/api/plans`, `/api/stats`, and `/api/runtimes` added to
  `PlatformAccessGuard`'s always-allowed prefixes so the landing page's
  dynamic sections don't break under maintenance mode.

### Added
- Part 8: full documentation set (README, INSTALL, DEPLOYMENT, ENVIRONMENT,
  API, SECURITY, BACKUPS, CONTRIBUTING, this changelog, LICENSE).
- Part 9: project-wide cleanup/audit pass.

## [1.0.0] — Production infrastructure

### Added (CI/CD)
- GitHub Actions CI pipeline: install, lint, type-check, build (frontend +
  backend), unit tests, integration tests, e2e tests, Docker build
  validation, and Docker Compose config validation.
- CodeQL static analysis workflow.
- Dependency vulnerability scanning workflow.
- Dependabot configuration for npm and GitHub Actions dependency updates.
- Release workflow for tagged versions (builds and publishes versioned
  Docker images).

### Added (Production infrastructure)
- Production Nginx config: HTTPS via Let's Encrypt/certbot, HTTP→HTTPS
  redirect, security headers, gzip, cache headers for static assets.
- `docker-compose.prod.yml`: hardened non-root images, per-service resource
  limits, healthchecks, log rotation, certbot renewal sidecar, reduced
  attack surface (only Nginx publishes ports).
- Production Dockerfiles (`Dockerfile.prod`) for backend and frontend:
  multi-stage builds, non-root users.
- Health check endpoints: `GET /api/health` (liveness) and
  `GET /api/health/ready` (readiness — checks Postgres, Redis, Docker
  socket).
- `.dockerignore` for both backend and frontend.
- ESLint + Prettier configs for both backend and frontend.
- `deploy/logrotate/` config and `deploy/crontab.example`.
- `scripts/backup-cron.sh` — infrastructure-level (DB + server files)
  backup script with retention pruning.
- `scripts/render-nginx-prod.sh` — templates the production Nginx config
  with the deployment's real domain.

### Fixed
- `FRONTEND_URL` and `SMTP_*` environment variables were read by the backend
  (`auth.service.ts`, `mail.service.ts`) but were never forwarded by
  `docker-compose.yml`, silently breaking password-reset/verification email
  links and outbound mail in any Docker-based deployment. Added to both
  `.env.example` and `docker-compose.yml`.

## [0.x] — Original application (Parts 1–5)

- Initial NestJS backend + Next.js frontend: auth, server lifecycle
  management, Docker-based bot isolation, file manager, live console over
  WebSocket, resource stats, backups, admin dashboard.
- Frontend polish: toast notifications, skeleton loaders, error boundaries,
  responsive layout, branding.
- File manager rewrite: drag-and-drop upload, multi-file upload with
  progress, context menu, keyboard shortcuts, inline rename/delete.
- Console rewrite: per-server command history, auto-reconnect, colored log
  levels, scroll-lock with "jump to latest", log search, log download.
- Initial backend/frontend test suites (Jest, ts-jest, Testing Library,
  supertest for e2e).
