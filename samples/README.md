# Demo content pack (Phase 1)

## Ideal footage
- Keep demo clips **under 3 minutes** total so FFmpeg jobs stay fast on laptops.
- Prefer one talking-head or screen-record take plus 1–2 B-roll beats.

## Example topic
**How I batch-create Reels in one afternoon**

## Sample script
See [`scripts/sample_script.md`](./scripts/sample_script.md) (Hook / Body / CTA).

## Notes for Integration / later phases
- Worker skeleton lives in `services/worker` (jobs start Phase 6+).
- AI method contracts are listed in `docs/ai-contracts.md` (no real provider calls yet).
- Dummy media: generate with `scripts/media/make-dummy-video.sh` (Cyrus) into `storage/samples/dummy.mp4`.
