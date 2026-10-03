# Project Workflow Stages

> **Owner:** Dev C (Arvin) — Phase 4  
> **Code:** `packages/shared/src/workflow/stages.ts`  
> **Source of truth for names:** SDD §4.2 `ProjectStage`  
> **Consumers:** Projects API (Anto), Projects/Kanban UI (Brendan)

---

## Enum (exact names)

| Stage | UI label (suggested) | Meaning for UI copy |
|-------|----------------------|---------------------|
| `IDEA` | Idea | Project is a concept only — title/description/platforms set; no script yet. |
| `SCRIPT` | Script | Script draft exists (or is being written); not yet recorded. |
| `RECORDED` | Recorded | Source footage / talks captured and attached as assets. |
| `EDITING` | Editing | Rough cut / timeline work in progress. |
| `CLIPS` | Clips | Short clips selected or scored from longer footage. |
| `ADAPTED` | Adapted | Platform-specific packs / aspect ratios prepared. |
| `READY` | Ready | Content is review-complete and ready to publish. |
| `PUBLISHED` | Published | **Terminal stage** — shipped / marked published. |

Order is fixed for MVP boards and progress:

`IDEA → SCRIPT → RECORDED → EDITING → CLIPS → ADAPTED → READY → PUBLISHED`

MVP allows moving **any** direction (forward or back); history is still recorded by the API.

---

## Shared helpers

```ts
import {
  projectStageSchema,
  defaultStageOrder,
  stageIndex,
  isTerminalStage,
} from '@creatorai/shared';

defaultStageOrder();       // readonly ProjectStage[]
stageIndex('EDITING');     // 3
stageIndex('NOPE');        // -1
isTerminalStage('READY');  // false
isTerminalStage('PUBLISHED'); // true
projectStageSchema.parse('IDEA'); // ok
```

| Helper | Behaviour |
|--------|-----------|
| `defaultStageOrder()` | Returns the canonical ordered list (same as `DEFAULT_STAGE_ORDER`). |
| `stageIndex(stage)` | Index in that list, or `-1` if unknown. |
| `isTerminalStage(stage)` | `true` only for `PUBLISHED`. |
| `projectStageSchema` | Zod enum — use in API request validation / UI forms. |

---

## Coordination notes

- **Anto (Phase 4 B):** Prisma `ProjectStage` enum **must** use these exact string names.
- **Brendan (Phase 4 A):** Prefer importing from `@creatorai/shared` instead of `TODO_SHARED` local constants once this package is built.
- **Cyrus (Phase 4 D / Integration):** Seed fixtures and Kanban columns should iterate `defaultStageOrder()`.

---

## Non-goals this phase

- No API routes or Prisma models (Anto).
- No Kanban UI (Brendan).
- No transition graph / “only forward” rules (MVP allows any move).
