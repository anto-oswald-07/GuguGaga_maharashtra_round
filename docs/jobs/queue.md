# CreatorAi — Job Queue (Phase 5)

> **Owner:** Dev B (Anto)  
> **Decision:** **DB-polling queue for MVP.** Worker writes results **directly to Postgres** (same Prisma models). No HTTP webhook from worker → API required for Phase 5.

## Why DB polling

Phase 1 Integration chose DB-polling over BullMQ for the hackathon MVP. Redis remains optional in compose (`--profile redis`) for a later BullMQ cutover.

## Flow

1. **API producer** (`enqueueJob`): inserts `Job` with `status=QUEUED`, `progress=0`, JSON `input`.
2. **Worker consumer** (Arvin Phase 5 C): poll `WHERE status='QUEUED' ORDER BY createdAt ASC`, claim with `UPDATE … SET status='RUNNING' … WHERE id=? AND status='QUEUED'`, run provider, write artifacts, set `SUCCEEDED` + `output` (or `FAILED` + `error`).
3. **UI**: poll `GET /api/v1/jobs/:id` until terminal status.

## Worker update path (chosen)

| Option | Chosen? | Notes |
|--------|---------|-------|
| Worker writes DB directly | **Yes** | Shared schema; simplest for monorepo |
| Worker PATCHes internal API | No (MVP) | Would need service token; defer |
| API webhook from worker | No | Extra hop |

`POST /api/v1/jobs/:id/mock-complete` mirrors the worker path for UI testing until the consumer lands. Integration should prefer the real worker and can leave mock-complete as a demo fallback.

## Job types (Phase 5+)

| Type | Producer | Artifact |
|------|----------|----------|
| `GENERATE_SCRIPT` | `POST /projects/:id/scripts/generate` | `ScriptDocument` + `ScriptVersion` (`source=AI` or `REFINE`) |
| `GENERATE_HOOKS` | `POST /scripts/:id/hooks` | Job `output.hooks: string[]` |
| `GENERATE_SUPPORTING` | `POST /scripts/:id/supporting` | Job `output.supporting` |
| Others (transcribe, render, …) | Later phases | — |

## Script content shape

```json
{ "hook": "...", "body": "...", "cta": "...", "title": "...", "rawText": "..." }
```

Shared Zod: `@creatorai/shared` → `scriptContentSchema` (`packages/shared/src/scripts.ts`).
