# Demo scripts (Phase 10 — Dev C)

| Script | Purpose |
|--------|---------|
| `seed-demo.ts` | Register/login `demo@creatorai.local`, create fixture project, upload/attach `dummy.mp4`, load `samples/scripts/sample_script.md` |
| `../seed/sample-project.ts` | Older project-only seed (Phase 4) — prefer `seed-demo.ts` for judging |

## Quick start

```bash
# API must be running; footage present
./scripts/media/make-dummy-video.sh
pnpm --filter api dev   # other terminal

pnpm --filter @creatorai/ai-provider exec tsx ../../scripts/demo/seed-demo.ts --dry-run
pnpm --filter @creatorai/ai-provider exec tsx ../../scripts/demo/seed-demo.ts
# or: node --import tsx scripts/demo/seed-demo.ts
```

Flags: `--dry-run`, `--skip-upload`, `--skip-script`, `--token <jwt>`.

Docs: `docs/demo/judge-script.md`, `docs/demo/offline-fallbacks.md`.
