# REVIEW — Phase 7: PWA Support

## Scope
Made the panel installable as a PWA: web app manifest, a generated icon
set matching the existing brand mark, a service worker, an offline
fallback page, and a custom install-prompt banner. No backend changes in
this phase — PWA support is entirely a frontend/static-asset concern.

## What was built
| File | Purpose |
|---|---|
| `frontend/public/manifest.json` (new) | Web app manifest — name, icons, `display: standalone`, dark theme/background colors. |
| `frontend/public/icon-192.png`, `icon-512.png` (new) | Standard app icons. |
| `frontend/public/icon-maskable-192.png`, `icon-maskable-512.png` (new) | Maskable variants with an 80% safe-zone, for Android adaptive-icon masking. |
| `frontend/public/apple-touch-icon.png` (new) | iOS home-screen icon. |
| `frontend/public/sw.js` (new) | Service worker — see caching strategy below. |
| `frontend/public/offline.html` (new) | Static offline fallback, zero JS dependency by design. |
| `frontend/src/components/PwaRegister.tsx` (new) | Registers the service worker on mount. |
| `frontend/src/components/InstallPrompt.tsx` (new) | Custom install banner. |
| `frontend/src/app/layout.tsx` | Added `manifest`/`appleWebApp` metadata, a `viewport` export, mounted the two new components. |
| `frontend/next.config.js` | `headers()` — no-cache + `Service-Worker-Allowed` on `/sw.js`. |

## Icon generation — why hand-drawn, not a screenshot/mockup
The sandbox has no network access and no SVG rasterizer available
(`rsvg-convert`/ImageMagick's SVG delegate weren't installed, and there's
no headless browser). Rather than shipping a generic placeholder icon
unrelated to the product, I used Python/PIL to redraw the *exact* same
shapes already defined in `favicon.svg` (the rounded-rect background, the
chevron, and the underscore-style line, in the same colors) at each
required resolution, including a maskable variant with proper safe-zone
padding. The result is pixel-faithful to the existing brand mark, not an
approximation — verify by comparing `public/favicon.svg` to the generated
PNGs.

## Why the service worker never touches `/api/*`
This is the single most important correctness decision in this phase.
Caching an API response, even briefly, risks serving another user's data
after a logout/login on a shared device, or showing a server's stale
RUNNING/STOPPED status as if it were live. A hosting control panel's
entire value proposition is that the data is current. So the service
worker's fetch handler explicitly returns early — untouched, straight to
network — for any request under `/api/`, before any caching logic runs.
This was deliberate, not an oversight; see the comment block at the top
of `sw.js`.

## What "offline support" does and doesn't mean here
- **Does:** installable home-screen icon, opens in its own window
  (`display: standalone`), and shows a clean branded offline page instead
  of the browser's default "no internet" error if a navigation fails with
  nothing cached.
- **Doesn't:** offline data entry, queued actions, or background sync.
  Given the product (real-time Docker container management, live console,
  billing), functioning "offline" in a deeper sense would mean showing
  actionable UI for data that might be stale or wrong — worse than just
  saying "you're offline, reconnect." Building a queue/sync layer for an
  admin control panel is a large, separate effort and wasn't implied by
  "PWA Support" in the original brief; flagged as a possible future
  phase in TODO.md rather than guessed at here.

## Testing status
Same sandbox constraint as prior phases — no network, so no real browser
Lighthouse/PWA-installability audit could be run. Verified by:
- **Code review** — confirmed `public/` assets are copied wholesale into
  the production image (`Dockerfile.prod`: `COPY --from=builder /app/public ./public`),
  confirmed `next.config.js`'s `headers()` API shape against Next 14's
  documented convention, confirmed `Viewport`/`appleWebApp` are valid
  `next` Metadata API exports for this Next.js version (14.2.15, which
  is where the separate `viewport` export was introduced).
- **Visually inspected** every generated icon by rendering the PNGs.
- **Not verified (would need a real browser):** an actual Lighthouse PWA
  audit, `beforeinstallprompt` firing in Chrome, the service worker's
  cache behavior across a real network-loss/reconnect cycle, or iOS
  Safari's manual "Add to Home Screen" rendering of `apple-touch-icon.png`.

## Design
Icons and offline page reuse the exact existing color palette
(`#0a0f0d` background, `#5eff9a` accent, `#212e28` border) rather than
introducing new brand colors. Install banner matches existing card/button
styling used throughout the dashboard (`bg-base-900`, `border-base-700`,
`signal-500` accent), and pulls the product name from the same
`useBranding()` context every other page already uses, rather than a
second hardcoded name.

---

# REVIEW — Phase 6: User Profile & Account Settings

## Scope
Added Change Username and Change Email to `frontend/src/app/dashboard/account/page.tsx`.
Change Password and Logout All Devices were already fully built (backend +
frontend) before this phase started — verified by reading the existing
`auth.controller.ts` (`POST /auth/change-password`, `POST /auth/logout-all`)
and the existing account page — so those were left untouched.

## What was built

### Backend (new/changed files)
| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Added `User.pendingEmail` (nullable) and `EMAIL_CHANGE` to the `OtpPurpose` enum. |
| `backend/prisma/migrations/20250501000000_account_settings/` (new) | Hand-written migration SQL matching the existing migration folder convention (couldn't run `prisma migrate dev` — no network/DB in this sandbox). Applies automatically on next deploy via the existing `npx prisma migrate deploy && node dist/main.js` container entrypoint. |
| `backend/prisma/seed.ts` | Added `email_change_otp` and `email_changed` default templates, same upsert-if-missing pattern as the existing ones — re-running the seed never clobbers an admin's edits. |
| `backend/src/common/mail/mail.service.ts` | Added `sendEmailChangeOtp()`, mirroring `sendVerificationOtp()`/`sendPasswordResetOtp()`. |
| `backend/src/users/dto.ts` (new) | `UpdateUsernameDto`, `RequestEmailChangeDto`, `ConfirmEmailChangeDto`. |
| `backend/src/users/users.service.ts` | Added `updateUsername`, `requestEmailChange`, `confirmEmailChange`, plus a small local OTP issue/verify helper pair scoped to `EMAIL_CHANGE` (intentionally not reusing `AuthService`'s private OTP helpers, to keep the two modules decoupled — see in-code comment). |
| `backend/src/users/users.controller.ts` | `PATCH /users/me/username`, `POST /users/me/email/request-change`, `POST /users/me/email/confirm-change`. Email-change routes get the same tighter throttle as login/register since they touch bcrypt + send mail. |

No changes to Billing, Pricing Manager, Runtime Manager, Discord Bot, Email
System, or any Phase 5 landing-page file.

### Frontend (changed file)
- `frontend/src/app/dashboard/account/page.tsx` — added a "Username"
  section and an "Email address" section (two-step form: request → enter
  new email + current password; confirm → enter the 6-digit code that
  arrives at the new address). Existing "Change password" and "Sessions"
  sections are unchanged.

## Design decisions worth flagging
- **Email change is two-step and OTP-gated at the new address**, not an
  instant overwrite. `User.email` is only written once the user proves
  they can receive mail at the new address — otherwise a typo'd email
  would lock the account out of ever logging in again (login is
  email-based). This mirrors the exact mechanism already used for
  registration's email verification.
- **Neither username nor email changes reissue a session/access token.**
  The JWT payload only carries `sub`/`role`/`sessionVersion` — neither
  field appears in it — so there's nothing to invalidate. This is
  different from Change Password's existing behavior (which does bump
  `sessionVersion` and reissue), which is correct: password changes must
  invalidate other sessions for security, identity-field changes don't.
- **Username change requires no password re-entry**; email change does.
  Username is cosmetic/low-risk. Email is the account's login credential,
  so it's treated the same way Change Password already treats the current
  password — as a re-auth gate before a security-sensitive change.

## Testing status
Same sandbox constraint as Phase 5 — no network, so no `npm install` /
`prisma migrate dev` / build could be run. Verified by:
- **Code review** — traced every new field name end-to-end (frontend
  request body → DTO → service → Prisma call), confirmed the migration SQL
  matches the schema.prisma edit exactly, confirmed `MailService` and
  `PrismaService` are both `@Global()` so `UsersModule` needs no new
  imports, confirmed the new routes don't collide with any existing
  `/users/*` route, and confirmed `PlatformAccessGuard`'s suspended-user
  allowlist already covers `/api/users/me/*` (no guard change needed).
- **Not verified (would need a running stack):** an actual
  `prisma migrate dev` against Postgres, a real OTP round-trip through
  SMTP, or a browser click-through of the two-step email-change form.

## Design
Followed the existing account page's exact visual pattern (same input/
label/button classes, same `border-t border-base-700 pt-8` section
divider, same `react-hot-toast` success/error handling) — no new UI
patterns introduced.

---

# REVIEW — Phase 5: Landing Page

## Scope
Migrated the landing-page improvements from `QuantaForge-Panel-Discord-Bot.zip`
(a vanilla HTML/JS panel) into the main NestJS/Next.js/Prisma/Postgres/Docker/
Nginx project, matching the main project's existing dark "signal-green"
design system rather than the feature source's original indigo/cyan theme.
Architecture, stack, and every previously-completed phase (Email, Billing,
Runtime Manager, Discord Bot) were left untouched.

## What was built

### Backend (new/changed files)
| File | Change |
|---|---|
| `backend/src/stats/stats.controller.ts` (new) | `GET /api/stats` — public totals: `totalUsers`, `totalServers`, `activeDeployments`, `uptimePercent`. |
| `backend/src/stats/stats.module.ts` (new) | Registers the controller. |
| `backend/src/app.module.ts` | Registers `StatsModule`. |
| `backend/src/runtimes/runtimes.controller.ts` | Moved `@UseGuards(JwtAuthGuard)` from class-level to method-level; `GET /runtimes` (catalog) is now public, `GET /runtimes/:id` and all `/runtimes/admin/*` routes are unchanged (still guarded). |
| `backend/src/common/guards/platform-access.guard.ts` | Added `/api/plans`, `/api/stats`, `/api/runtimes` to `ALWAYS_ALLOWED_PREFIXES` so these still resolve during maintenance mode. |

No new Prisma models, no schema migration, no changes to Email/Billing/
Discord Bot modules.

### Frontend (new files)
- `frontend/src/app/page.tsx` — rewritten as the Phase 5 landing page.
- `frontend/src/components/landing/` — `LandingNav`, `Hero`, `LiveStats`,
  `AnimatedCounter`, `PricingSection`, `RuntimesSection`,
  `WhyChooseSection`, `LocationsSection`, `ReviewsSection`, `FaqSection`,
  `DiscordCta`, `useScrollReveal`.
- `frontend/src/app/terms/page.tsx`, `privacy/page.tsx`, `status/page.tsx`.
- `frontend/src/components/Footer.tsx` — extended to show a full
  marketing footer only on `/`; unchanged everywhere else.

## Where each dynamic section gets its data
| Section | Source | Notes |
|---|---|---|
| Pricing | `GET /api/plans` (existing, unchanged) | No hardcoded prices. |
| Live stats | `GET /api/stats` (new) | See "New endpoints" above. |
| Runtimes | `GET /api/runtimes` (existing, now public) | Shows only what's actually seeded/enabled — see judgment call below. |
| Discord buttons | `useBranding().discordInvite` (existing `GET /api/branding`) | Same source the rest of the app already uses. |
| Status page | `GET /api/health`, `GET /api/health/ready` (existing, unchanged) | Real liveness/readiness, not fabricated. |
| Locations, reviews, FAQ | Static, in-component | No backing Prisma model exists for these yet — flagged in `TODO.md`, not silently faked as "dynamic." |

## Judgment call flagged for your review
The ticket's "Supported Runtimes" list names 8 languages (Node.js, Python,
Java, Go, PHP, Rust, Bun, Deno). The `Runtime` Prisma enum only has
`NODEJS` and `PYTHON`, and only those two are seeded/functional — Docker
execution doesn't support the other six today. Hardcoding all 8 as static
marketing copy would misrepresent what a paying customer actually gets.
I made the runtime section pull live from `GET /api/runtimes` instead, so
it shows exactly what's real and grows automatically as engines are added.
If you'd rather ship the full aspirational 8-language list as pure
marketing copy regardless of backend state, that's a one-file change in
`RuntimesSection.tsx` — happy to do it if you tell me to.

## Testing status
Per the ticket's own instructions, this sandbox has no network access, so
`npm install` / `npm run build` / `npm test` could not be run. Verified
instead by:
- **Code review** — read every backend and frontend file touched or
  added, traced each landing-page API call against the actual controller
  route and response shape it targets (`/plans` → `SerializedPlan[]`,
  `/runtimes` → `{ runtimes, defaults }`, `/stats` → the new controller's
  return value, `/health` + `/health/ready` → existing controller).
- **Static consistency checks** — confirmed field names match exactly
  between backend serializers and frontend TypeScript interfaces (e.g.
  `PublicPlan`, `RuntimeEngine`, `PublicStats`), confirmed no route-path
  collisions in `app.module.ts` or within `RuntimesController`, confirmed
  `tsc` itself is present in the sandbox but a real type-check isn't
  possible without `node_modules` (no network to `npm install`).
- **Not verified (would need `npm install` + a running stack):** an
  actual `next build` / `nest build`, ESLint, a live browser render, and
  end-to-end clicks through Discord links / Login / Register.

### Not broken (verified by reading the code, not by running it)
- Billing, Pricing Manager, Runtime Manager (admin CRUD routes), Discord
  Bot, and Email System modules were not modified — only the runtimes
  controller's guard placement changed, and that change is behavior-
  equivalent for every existing authenticated caller.
- No duplicate APIs were created — `/api/stats` is new because nothing
  public existed; `/api/runtimes` reuses the existing catalog endpoint
  rather than adding a second one.
- No TypeScript errors were introduced that code review could catch
  (types line up end-to-end for every new call), though this is not a
  substitute for an actual compile.

## Design
Followed the main project's existing Tailwind tokens (`base-950`…`base-600`
dark surfaces, `signal-500`/`signal-400` green accent) and existing
components (`Logo`, `useBranding`, `useAuth`, `api` axios client) rather
than importing the feature source's indigo/cyan glassmorphism theme
verbatim. Scroll-reveal animations respect `prefers-reduced-motion`.
Dashboard and admin panel were not touched.
