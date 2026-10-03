# CreatorAi — Demo Content Pack

Sample content for local demos and judge walkthroughs. Keep footage short so transcription, clipping, and timeline render stay fast.

## Guidelines

| Item | Recommendation |
|------|----------------|
| Ideal footage length | **Under 3 minutes** for demos |
| Example topic | “How I batch-create Reels in one afternoon” |
| Script fixture | `samples/scripts/sample_script.md` |
| Project fixture | `samples/projects/demo-project.json` |
| Dummy video | Generate via `./scripts/media/make-dummy-video.sh` → `storage/samples/dummy.mp4` (do **not** commit binaries) |
| Judge click-script | `docs/demo/judge-script.md` (Phase 10) |
| Demo seed | `pnpm --filter @creatorai/ai-provider exec tsx ../../scripts/demo/seed-demo.ts` |
| Offline fallbacks | `docs/demo/offline-fallbacks.md` |

## What’s in this folder

- `scripts/sample_script.md` — Hook / Body / CTA script used by Mock AI and golden-path demos
- `projects/demo-project.json` — title / platforms / paths for seed + judge prep

## How to use in a demo

1. Ensure `AI_PROVIDER=mock` (deterministic; optional `AI_MOCK_SEED`).
2. `pnpm --filter @creatorai/ai-provider exec tsx ../../scripts/demo/seed-demo.ts` (user + project + footage + sample script).
3. Login `demo@creatorai.local` / `password123`.
4. Walk Script → Mapping → Clips → Timeline → Platform Packs per `docs/demo/judge-script.md`.

## Notes

- Do not commit large media files into `samples/`. Link or generate them locally.
- Sample script text is intentionally short and structured for deterministic Mock AI output.
