# SenatoRoom Agent Guide

## Working mode

- Keep responses, plans, and tool output concise. State the result first; explain only decisions that affect scope, risk, or verification.
- Read the smallest useful set of files. Start with `rg` to locate symbols, routes, or callers, then open only the relevant ranges.
- Do not scan `node_modules/`, `dist/`, `uploads/`, `backups/`, generated migration snapshots, or binary files unless the task explicitly requires them.
- Reuse information already established in the conversation. Do not repeat repository discovery, test output, or file contents without a concrete need.
- Prefer one focused command over several exploratory commands. Cap command output with targeted paths, line ranges, and `rg` patterns.
- Make one coherent change set per request. Avoid opportunistic refactors, dependency updates, formatting churn, and unrelated renames.

## Project map

- Client: React + Vite in `src/` (`App.tsx` is the primary UI composition point).
- Server: Express + Socket.IO in `server/index.ts`.
- Data: SQLite + Drizzle; schema is `server/db/schema.ts`, migrations are `server/db/migrations/`.
- Shared client contracts: `src/types.ts`; client HTTP helpers: `src/api.ts`.
- Server utilities: `server/utils/`.
- Runtime configuration is centralized in `server/config.ts`; documented defaults live in `.env.example`.

## Preserve invariants

- Treat authentication, authorization, conversation membership, attachment ownership, and local-only admin access as security boundaries. Enforce them server-side; never rely on client checks.
- Message bodies are encrypted at rest with AES-256-GCM. Do not change encryption formats, keys, or message storage semantics without a migration and compatibility plan.
- `JWT_SECRET` and `MESSAGE_ENCRYPTION_KEY` are persistent secrets. Never log, commit, replace, or expose their values.
- Keep `.env`, `data/`, `uploads/`, and `backups/` out of Git. Use `.env.example` only for non-secret defaults and documentation.
- Preserve API response shapes and Socket.IO event behavior unless the requested change explicitly includes a contract change. Update all known client/server consumers together.
- Do not edit existing migration SQL or migration metadata after it may have been applied. For schema changes, create a new migration through `npm.cmd run db:generate`, inspect it, and run it against a disposable database.

## Change workflow

1. Inspect the target code, its direct callers, and the nearest relevant test before editing.
2. Identify cross-boundary effects: UI/API, API/database, Socket.IO/client, storage/database, or configuration/deployment.
3. Implement the smallest complete change. Keep TypeScript strict; do not introduce `any`, unsafe casts, or ignored errors to satisfy the compiler.
4. Run the narrowest relevant test first. Run `npm.cmd run build` for client, server, type, or shared-contract changes. Run `npm.cmd test` when the relevant suite is not isolated or the change affects core behavior.
5. Report changed files and exact verification performed. If verification is not run, state why.

Integration tests start the server with a temporary SQLite database, upload directory, backup directory, and test secrets. Prefer that isolated pattern when adding server/API coverage instead of using local `.env` data.

## Commands

```powershell
npm.cmd run dev
npm.cmd run dev:client
npm.cmd run dev:server
npm.cmd run build
npm.cmd start
npm.cmd test
npm.cmd run db:generate
npm.cmd run db:migrate
```

## Git discipline

- Check `git status --short` before editing and preserve unrelated user changes.
- Do not use destructive Git commands (`reset --hard`, forced checkout, clean) unless explicitly requested.
- Do not commit, push, open pull requests, modify production configuration, or delete user data without explicit instruction.
