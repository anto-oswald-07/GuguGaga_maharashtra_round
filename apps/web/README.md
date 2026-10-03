# CreatorAi — Web App (`apps/web`)

Next.js (App Router) + TypeScript + Tailwind frontend shell for CreatorAi.

## Prerequisites

- Node.js 20+
- `pnpm` (preferred)

## Install

From this directory (standalone, until root workspace exists):

```bash
cd apps/web
pnpm install
```

Once Anto wires the monorepo root (`pnpm-workspace.yaml` + root `package.json`), prefer:

```bash
# from repo root
pnpm install
pnpm --filter web dev
```

## Run (dev)

```bash
cd apps/web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | API base URL (default `http://localhost:4000/api/v1`) |

## Routes

- `/` — Landing (features)
- `/dashboard` — Workspace dashboard
- `/login`, `/register` — Auth
- `/assets` — Asset library
- `/projects` — Project list
- `/projects/[id]` — Project hub
- `/projects/[id]/editor` — Timeline editor
- `/workflow` — Kanban
- `/jobs` — Job center
- `/insights` — Intelligence

## Notes for Integration

- Package name is `web` so `pnpm --filter web` works once the root workspace includes `apps/*`.
- Root `pnpm-workspace.yaml` is **not** created here (Anto / Phase 1 Dev B).
