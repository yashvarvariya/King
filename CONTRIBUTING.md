# Contributing

Thanks for considering a contribution. This is a small project — the process
is intentionally lightweight.

## Getting set up

Follow [INSTALL.md](./INSTALL.md) to get a working dev environment, then run
the app outside Docker (`npm run start:dev` / `npm run dev`) for fast
iteration.

## Workflow

1. Fork the repo and create a branch off `main`: `git checkout -b feat/short-description`.
2. Make your change. Keep commits focused — one logical change per commit.
3. Run the checks locally before opening a PR:
   ```bash
   cd backend && npm run lint && npm test && npm run test:e2e
   cd ../frontend && npm run lint && npm test
   ```
4. Open a pull request against `main`. CI (`.github/workflows/ci.yml`) will
   run lint, type-check, build, and the full test suite automatically —
   make sure it's green before requesting review.

## Coding standards

- **TypeScript everywhere**, strict mode on. Avoid `any` where a real type
  is easy to express; if you must use it, prefer `unknown` + a narrowing
  check.
- **Formatting** is enforced by Prettier (`.prettierrc` in both
  `backend/` and `frontend/`) and linting by ESLint
  (`.eslintrc.js` / `.eslintrc.json`). Run `npm run lint` / `npm run format`
  before committing — CI will fail on lint errors.
- **No `console.log` in application code** outside of the single startup
  log line in `main.ts` (which is explicitly lint-disabled) — use proper
  error handling/return values instead, or a `Logger` if you need runtime
  diagnostics.
- **Backend**: NestJS conventions — one module per feature under
  `backend/src/`, DTOs validated with `class-validator`, guards for
  auth/roles rather than manual checks inside handlers.
- **Frontend**: App Router conventions under `frontend/src/app`, shared UI
  in `frontend/src/components`. Prefer Tailwind utility classes over new
  CSS.
- **Security-sensitive code** (anything touching file paths, ZIP
  extraction, or the Docker socket) needs extra care — see the threat model
  in [SECURITY.md](./SECURITY.md) before changing `files.service.ts`,
  `backups.service.ts`, or `docker.service.ts`.

## Tests

- New backend logic should have a corresponding `.spec.ts` (unit) and, for
  new endpoints, ideally an e2e test under `backend/test/`.
- New non-trivial frontend components should have a test under
  `frontend/src/components/__tests__/`.
- Don't reduce existing test coverage without a good reason called out in
  the PR description.

## Commit messages

Conventional, short, imperative mood: `fix: handle missing SMTP_HOST`,
`feat: add per-server backup retention`. Not strictly enforced, but makes
`CHANGELOG.md` easier to keep accurate.

## Reporting bugs / requesting features

Open a GitHub issue with steps to reproduce (for bugs) or the use case (for
features). For security issues, see [SECURITY.md](./SECURITY.md) instead —
please don't open a public issue.
