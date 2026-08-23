# Bot Hosting Panel — Progress

Backend is fully implemented and untouched this session. Auth, File Manager, Hosting are complete
and untouched from prior sessions.

**This zip is still not a finished product — do not deploy as-is.** Treat it as a mid-session
checkpoint, shared early by request. Build verification has NOT been run (no network access in
this container — `npm install` returns 403 from the registry). Only a syntax-only `tsc
--noResolve` pass was done across every file (zero syntax errors), which is not a real type-check.

## Completed this session

1. **Free Plan limit popup** — `frontend/src/components/FreePlanModal.tsx` (new). Wired into
   `dashboard/page.tsx`'s `onCreate()` catch block: detects `err.response.data.freePlanLimit`
   (the shape `servers.service.ts` `create()` throws) and shows a proper modal — "Free Plan Limit
   Reached" + Discord upgrade link + support email — instead of the old inline error text.

2. **Admin Panel — full rewrite**, replacing the old stale `admin/page.tsx` (which referenced
   `stats.userCount` etc. that no longer matched the real API):
   - `frontend/src/components/AdminSidebar.tsx` (new) — vertical sidebar, 7 tabs.
   - `frontend/src/app/admin/page.tsx` (rewritten) — loads `/admin/stats`, `/admin/users`,
     `/admin/servers`, `/branding` in parallel; redirects non-admins to `/dashboard`; renders the
     active tab.
   - `frontend/src/components/admin/types.ts` (new) — `AdminStats`, `AdminUser`, `AdminServer`,
     `QuotaFields`, `ServerResourceFields` — typed to match the real backend response shapes.
   - `frontend/src/components/admin/AdminUI.tsx` (new) — shared primitives: `StatTile`,
     `AdminModal`, `Field`, `TextInput`, `NumberField`, `PrimaryButton`, `SecondaryButton`,
     `DangerButton`.
   - `DashboardTab.tsx` — 7 stat tiles from `GET /admin/stats`.
   - `UsersTab.tsx` — list, create, and a "Manage" modal per user with suspend/unsuspend, role
     toggle, grant/remove premium, reset-email-verification, reset-password (shows the returned
     temp password once), and delete (with a confirm step).
   - `ServersTab.tsx` — list (with owner), create-for-user (owner picked from a `<select>` of all
     users), force-stop/restart/kill, delete, and a per-server resource-edit modal
     (memory/CPU/disk, respecting the 64/10/100 minimums).
   - `ResourcesTab.tsx` — inline-editable per-user quota table (`maxServers`/`maxMemoryMb`/
     `maxDiskMb`/`maxCpuPercent`/`backupLimit`) with per-row Save.
   - `BrandingTab.tsx` — hosting name, browser title, logo/favicon upload (multipart →
     `/branding/upload/logo|favicon`), Discord invite, support email, theme color pickers, footer
     text, a live preview pane, and Save (excludes `maintenanceMode` from its PATCH so it can't
     clobber the Maintenance tab's toggle).
   - `MaintenanceTab.tsx` — on/off toggle switch, `PATCH /branding { maintenanceMode }`.
   - `PremiumTab.tsx` — filtered premium-users view + a "Grant Premium" picker modal over free
     users + per-row "Remove Premium".

## Still outstanding — this is NOT production-ready yet

1. **No real build verification has been run.** This container has no network access
   (`npm install` → 403 from the registry), so none of the following have actually been executed:
   - `cd backend && npm install && npx prisma generate && npx tsc --noEmit`
   - `cd frontend && npm install && npx tsc --noEmit && npm run build`
   - `docker compose build` / `docker compose -f docker-compose.prod.yml config` smoke test
   Only a syntax-only pass (`tsc --noResolve`, no real type info, no node_modules) was done across
   every `.ts`/`.tsx` file — it caught zero `TS1xxx` syntax errors, but this does **not** catch
   type mismatches, missing/incorrect imports, wrong prop names, etc. A real `tsc --noEmit` pass
   with dependencies installed is still required before this can be trusted.

2. **Manual cross-check of the new admin components was in progress and not finished.** Started
   comparing every prop passed into `DashboardTab`/`UsersTab`/`ServersTab`/`ResourcesTab`/
   `BrandingTab`/`MaintenanceTab`/`PremiumTab` against their declared prop types, and every import
   in those files against what's actually exported from `lib/branding.tsx`, `lib/auth.ts`,
   `lib/api.ts`, `StatusPill.tsx`, `Skeleton.tsx`, `ErrorState.tsx` — not completed. Do this first
   on resume, before anything else, since it's cheap and would catch real bugs that a `tsc
   --noEmit` run would also catch.

3. **The "FINAL REVIEW" pass has not started at all**: haven't re-checked Docker, Prisma schema
   validity, Redis, Authentication, File Manager, Hosting, or the Suspension flow this session
   (they were already complete/untouched from prior sessions, but the original task asked for an
   explicit re-check of all of them before the final zip — not done yet).

4. Per-user `backupLimit` is stored/admin-editable but still not enforced anywhere in
   `backups.service.ts` (flagged, unresolved, across three sessions now — low priority, not in the
   original task list, just a known gap).

5. **No final production zip has been generated.** The zip this PROGRESS.md ships in is a
   mid-session checkpoint only, shared early by explicit request — it has not been through step 4
   ("Production Verification") or the "FINAL REVIEW" section of the original task yet.

## How to continue

Send "Continue" and pick up at item 2 above (finish the prop/import cross-check — quick), then
item 1 (get a real `npm install` + `tsc --noEmit` + `next build` + `prisma validate` run — needs
network access), then item 3 (the full module-by-module final review), then generate the actual
final production zip only after all of that passes.
