# TODO — QuantaForge Migration

## Completed phases
- Phase 1 — Email System
- Phase 2 — Billing + Pricing Manager
- Phase 3 — Runtime Manager
- Phase 4 — Discord Management Bot
- Phase 5 — Landing Page
- Phase 6 — User Profile & Account Settings
- Phase 7 — PWA Support ✅ (this package)
  - Installable (manifest.json + icon set generated to match the existing
    brand mark, no external image dependency)
  - Offline fallback page + service worker (never caches `/api/*` — see
    REVIEW.md for why that matters)
  - Custom "Add to Home Screen" banner (Chrome/Edge/Android only — iOS
    Safari has no programmatic install prompt, which is a platform
    limitation, not something addressable from this codebase)

## Remaining phases
None currently specified. All phases listed in the original migration
brief (1 through 7) are complete.

## Known follow-ups from Phase 7 (not blockers, just noted for later)
- **manifest.json's `name`/`short_name` are static** ("Kerit Panel", the
  same default used elsewhere as a fallback before `/api/branding`
  loads) rather than pulled from an admin's actual configured
  `hostingName`. A truly per-tenant install name would need a
  server-rendered manifest route that fetches branding at request time —
  deliberately not built speculatively here since even a "live" manifest
  wouldn't rename an *already-installed* PWA (the OS snapshots the name/
  icon at install time), so the payoff is small relative to the risk of
  an unverifiable new server-fetch pattern in a no-network sandbox. If
  this matters for a white-labeled deployment, it's a contained,
  well-scoped follow-up.
- **No offline data/queueing.** This is a real-time hosting control
  panel — server status, console output, and billing are only ever
  meaningful when live. The service worker makes the *shell* installable
  and shows a clean offline page instead of a browser error, but doesn't
  attempt to cache or replay any API data, and shouldn't — see REVIEW.md.
- **Install banner only fires on Chromium-based browsers** (Chrome, Edge,
  Android WebView). iOS Safari never fires `beforeinstallprompt` — Apple
  doesn't expose one — so iOS users still have to use Safari's manual
  Share → "Add to Home Screen" flow. This is a platform limitation than
  can't be worked around from application code.

## Known follow-ups from Phase 6 (not blockers, just noted for later)
- **No "resend code" button on the email-change confirmation step.** The
  user can get a new code by re-submitting the "Send confirmation code"
  form with the same new email (the 60s cooldown from `OTP_RESEND_COOLDOWN_SECONDS`
  still applies), but there's no dedicated resend link on the code-entry
  screen itself. Small UX polish, not a functional gap.
- **Changing username doesn't re-check server-name collisions** or
  anything else tied to identity elsewhere in the app (e.g. Discord bot
  command logs store `discordUsername` separately and are unaffected).
  Reviewed the schema for anything else keyed on username besides the
  unique constraint — found nothing else that needs updating.
- **No admin-facing audit trail entry** is written when a user changes
  their own username/email (unlike `BillingHistory`, which does log
  plan-change actions). Worth adding if/when a general "account activity
  log" surface is built — out of scope for this phase.

## Known follow-ups from Phase 5 (not blockers, just noted for later)
- **Runtime list is intentionally minimal today.** The Prisma `Runtime`
  enum only defines `NODEJS` and `PYTHON`, and only those two are seeded
  in `prisma/seed.ts` / actually executable via the Docker runner. The
  landing page's "Supported Runtimes" section pulls live from
  `GET /api/runtimes` rather than hardcoding the full aspirational list
  (Node.js, Python, Java, Go, PHP, Rust, Bun, Deno) from the feature
  source, so it never overpromises what the platform can run today. When
  more runtime families are added to the enum/seed data, they'll appear
  here automatically with no landing-page change needed.
- **`uptimePercent` in `GET /api/stats` is a documented constant (99.9),
  not a measured figure.** There's no historical uptime-tracking system
  anywhere in this codebase — `health.controller.ts` only reports current
  process uptime, not a rolling SLA percentage. Building real historical
  uptime tracking is a reasonable future project, but out of scope for a
  landing-page phase.
- **Server locations (India / Singapore) and customer reviews are static
  content**, carried over from the feature-source panel. There's no
  `Region` or `Review`/`Testimonial` Prisma model yet, so nothing to wire
  up dynamically. Worth a real model + admin CRUD if/when reviews or
  multi-region deployment become real product surfaces.
- **`LandingNav` always shows "Sign In / Create Account"**, even for an
  already-logged-in visitor. A small nice-to-have would be swapping that
  for a "Go to Dashboard" link when `useAuth()` reports a user — left
  alone in this phase to keep the diff focused on the phase's actual
  scope.
- **Discord "Open a Ticket" button reuses the same invite link** as "Join
  the Discord" (`branding.discordInvite`). There's no separate
  ticket-system URL anywhere in the schema/branding config, and opening a
  ticket via a Discord bot command inside the server is the platform's
  actual existing purchase flow, so this is accurate — not a placeholder.
