# CreatorAi — Demo Content Pack

Sample content for local demos and judge walkthroughs. Keep footage short so transcription, clipping, and timeline render stay fast.

## Guidelines

| Item | Recommendation |
|------|----------------|
| Ideal footage length | **Under 3 minutes** for demos |
| Example topic | “How I batch-create Reels in one afternoon” |
| Script fixture | `samples/scripts/sample_script.md` |
| Dummy video | Generate via `./scripts/media/make-dummy-video.sh` → `storage/samples/dummy.mp4` (do **not** commit binaries) |

## What’s in this folder

- `scripts/sample_script.md` — Hook / Body / CTA script used by Mock AI and golden-path demos (Phase 5+)

## How to use in a demo

1. Register/login (Phase 2).
2. Create a project aimed at Reels / Shorts.
3. Paste or load the sample script text.
4. Attach short footage (dummy MP4 or your own < 3 min clip).
5. Walk Script → Mapping → Clips → Timeline → Platform Packs.

## Notes

- Do not commit large media files into `samples/`. Link or generate them locally.
- Sample script text is intentionally short and structured for deterministic Mock AI output.
