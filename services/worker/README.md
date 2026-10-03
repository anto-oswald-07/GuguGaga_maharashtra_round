# CreatorAi — Worker

Background job worker for media and AI tasks.

## Status (Phase 1)

Skeleton only. This package prints `worker skeleton started` and exits.

**Jobs come in Phase 6+** (transcription, alignment, clip scoring/render, timeline render, platform adapt). Earlier phases may add stubs under `src/jobs/` or `src/media/` as allowed by the development plan.

## How to run

From repo root (after `pnpm install`):

```bash
pnpm --filter worker start
# or
pnpm --filter worker dev
```

From this folder:

```bash
pnpm install
pnpm start
```

## Notes

- Do not implement real queue consumers here until the phase that assigns them.
- Coordinate job payload shapes via `packages/shared` and `docs/ai-contracts.md`.
