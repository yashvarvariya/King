# API Reference

Base URL: `{NEXT_PUBLIC_API_URL}` (e.g. `http://localhost:4000` in dev). All
REST routes are prefixed with `/api`. Auth is via `Authorization: Bearer
<jwt>` unless noted. Request bodies are validated with `class-validator`;
unrecognized fields are rejected (`403`-adjacent `400 Bad Request`).

## Auth — `/api/auth`

| Method | Path | Body | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/register` | `{ email, username, password }` | none | 5/min |
| POST | `/login` | `{ email, password }` | none | 8/min |
| GET | `/me` | — | Bearer | — |
| POST | `/forgot-password` | `{ email }` | none | 3/min |
| POST | `/reset-password` | `{ token, newPassword }` | none | 5/min |
| POST | `/change-password` | `{ currentPassword, newPassword }` | Bearer | — |
| POST | `/verify-email` | `{ token }` | none | 5/min |
| POST | `/resend-verification` | `{ email }` | none | 3/min |
| POST | `/logout-all` | — | Bearer | — |

`username`: 3–20 chars, letters/numbers/`_`/`-`. `password`: min 8 chars.
`logout-all` bumps the user's `sessionVersion`, invalidating every
previously issued JWT.

## Users — `/api/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | Bearer | Current user profile |
| GET | `/me/usage` | Bearer | Current server count / quota usage |

## Servers — `/api/servers`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Bearer | List the caller's servers (all servers, if admin) |
| GET | `/:id` | Bearer (owner/admin) | Server detail |
| POST | `/` | Bearer | Create — `{ name, runtime: 'NODEJS'\|'PYTHON', description?, startupCommand? }` |
| PATCH | `/:id/rename` | owner/admin | `{ name }` |
| PATCH | `/:id/settings` | owner/admin | `{ startupCommand?, autoRestart?, autoBackupEnabled?, backupRetention? }` |
| PATCH | `/:id/env` | owner/admin | `{ env: { KEY: value, ... } }` |
| DELETE | `/:id` | owner/admin | Deletes server, its container, and its files |
| POST | `/:id/suspend` | admin | Stops the container and blocks starts until unsuspended |
| POST | `/:id/unsuspend` | admin | |
| POST | `/:id/start` | owner/admin | Creates the container if needed and starts it |
| POST | `/:id/stop` | owner/admin | Graceful stop |
| POST | `/:id/restart` | owner/admin | |
| POST | `/:id/kill` | owner/admin | Force kill |
| POST | `/:id/install` | owner/admin | Runs dependency install (`npm install` / `pip install -r requirements.txt`, auto-detected) |
| GET | `/:id/stats` | owner/admin | Live CPU/RAM/disk snapshot |
| POST | `/:id/github-import` | owner/admin | `{ repoUrl, branch? }` — clones a repo into the server's file tree |

## Files — `/api/servers/:serverId/files`

All paths are relative to the server's root and are validated server-side
to stay inside it (path-traversal protected).

| Method | Path | Description |
|---|---|---|
| GET | `/?path=` | List directory contents |
| GET | `/content?path=` | Read a text file's contents |
| POST | `/content` | `{ path, content }` — write/overwrite a text file |
| POST | `/create` | `{ path, type: 'file'\|'folder' }` |
| POST | `/rename` | `{ path, newPath }` |
| DELETE | `/?path=` | Delete a file or folder |
| POST | `/upload` | Multipart single-file upload |
| POST | `/upload-zip` | Multipart ZIP upload, auto-extracted (zip-slip protected) |

## Backups — `/api/servers/:serverId/backups`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List backups for a server |
| POST | `/` | Create a new backup (queued via BullMQ) |
| POST | `/:backupId/restore` | Restore this backup over the server's current files |
| GET | `/:backupId/download` | Download the raw ZIP |
| DELETE | `/:backupId` | Delete a backup |

See [BACKUPS.md](./BACKUPS.md) for how this relates to infrastructure-level
backups.

## Admin — `/api/admin`

All routes require an `ADMIN` role (`RolesGuard`).

| Method | Path | Description |
|---|---|---|
| GET | `/stats` | Platform-wide counts (users, servers, running containers, etc.) |
| GET | `/users` | List all users |
| GET | `/servers` | List all servers across all users |
| PATCH | `/users/:id/quotas` | Update a user's `maxServers`/`maxDiskMb`/`maxMemoryMb`/`maxCpuPercent` |
| PATCH | `/users/:id/role` | Promote/demote a user's role |

## Health — `/api/health`

Unauthenticated. See `backend/src/health/health.controller.ts`.

| Method | Path | Description |
|---|---|---|
| GET | `/` | Liveness: process uptime, always `200` if the process is up |
| GET | `/ready` | Readiness: checks Postgres, Redis, and the Docker socket; `200` if all pass, `503` otherwise |

## WebSocket — console gateway

Connects via Socket.IO to `{NEXT_PUBLIC_WS_URL}`, authenticated with the same
JWT (`backend/src/console/console.gateway.ts`).

| Event (client → server) | Payload | Description |
|---|---|---|
| `subscribe` | `{ serverId }` | Attach to a server's live log stream |
| `unsubscribe` | `{ serverId }` | Detach |
| `stdin` | `{ serverId, data }` | Write to the container's stdin |

| Event (server → client) | Payload | Description |
|---|---|---|
| `log` | `{ serverId, line }` | A new stdout/stderr line |
| `stats` | `{ serverId, cpu, memory, disk }` | Periodic resource usage push |
| `status` | `{ serverId, status }` | Server status transition (e.g. `RUNNING` → `OFFLINE`) |

## Error format

Standard NestJS HTTP exception shape:

```json
{
  "statusCode": 400,
  "message": "username must be 3-20 chars: letters, numbers, _ or -",
  "error": "Bad Request"
}
```
