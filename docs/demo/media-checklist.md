# Media checklist — judges’ machine (Phase 10 / Dev D)

> Owner: Cyrus (Dev D). Companion: `docs/demo/golden-path-prep.md`, `docs/ffmpeg-notes.md`.  
> Goal: cold laptop can run every media step in the golden path without surprise ffmpeg gaps.

---

## 1. Required tools

| Tool | Why | Check |
|------|-----|--------|
| **ffmpeg** | thumbs, STT audio, clip cut, timeline render, aspect adapt | `./scripts/media/check-ffmpeg.sh` |
| **ffprobe** | duration / dimension probes (same package as ffmpeg) | included in check above |
| **Node 20+ / pnpm** | worker + API (see root README) | `node -v` / `pnpm -v` |

Install hints:

```bash
# Debian/Ubuntu
sudo apt-get update && sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg
```

Fontconfig / `drawtext` (timeline overlays): most Linux images ship fonts; if overlays are blank, install `fonts-dejavu-core` (Ubuntu) or ensure a system font is available.

---

## 2. Pre-demo bake (do this once per machine)

```bash
./scripts/media/check-ffmpeg.sh
./scripts/media/make-dummy-video.sh          # → storage/samples/dummy.mp4 (5s 16:9)
./scripts/media/bake-demo-fallback.sh       # → storage/samples/demo-fallback-clip.mp4
./scripts/media/verify-media-hardening.sh   # happy path + edge guards
```

Do **not** commit binaries under `storage/` (gitignored). Always re-bake on the judges’ laptop.

Optional smokes:

```bash
./scripts/media/generate-thumb.sh
./scripts/media/extract-audio.sh
./scripts/media/cut-clip.sh
./scripts/media/adapt-aspect.sh storage/samples/dummy.mp4 all
```

---

## 3. Golden-path media map

| Step | Media op | Helper | Typical path |
|------|----------|--------|----------------|
| Upload footage | (API storage) | — | `storage/workspaces/.../originals/...` |
| Thumbnail | mid-frame JPEG | `thumbnail.ts` | `derivatives/{assetId}/thumb.jpg` |
| Transcribe prep | mono 16 kHz WAV | `extractAudio.ts` | `derivatives/{assetId}/audio.wav` |
| Render accepted clip | cut window | `cutClip.ts` | `renders/{jobId}/output.mp4` |
| Timeline preview | concat + drawtext | `renderTimeline.ts` | `renders/{jobId}/output.mp4` (+ `.srt`) |
| Platform packs | crop/pad ratios | `adaptAspect.ts` | `renders/{jobId}/pack-{platform}.mp4` |

Default aspect sizes (MVP): **16:9** 1280×720 · **9:16** 720×1280 · **1:1** 1080×1080.

---

## 4. Clear job failure strings (Phase 10 hardening)

Worker media helpers throw `MediaPipelineError` with stable `code` + human message (surfaced as `job.error`):

| Code | Meaning |
|------|---------|
| `INPUT_MISSING` | Path empty / file not readable |
| `INPUT_EMPTY` | 0-byte file |
| `ZERO_DURATION` | ffprobe duration unusable |
| `RANGE_INVALID` | Zero/negative clip or timeline window |
| `RANGE_OUT_OF_BOUNDS` | Clip **start** past source EOF (or empty after clamp) |
| `ASSET_UNMAPPED` | Timeline clip assetId has no `assetPaths` entry |
| `FFMPEG_MISSING` | `ffmpeg`/`ffprobe` not on PATH |
| `FFMPEG_FAILED` | ffmpeg exited non-zero (stderr tail included) |
| `OUTPUT_MISSING` | Expected output file missing/empty after run |

**Range policy:** `endMs` past source EOF is **clamped** to EOF (same as prior ffmpeg `-t` behavior). That keeps Phase 7/9 SCORE / mock windows working on short `dummy.mp4` (~5s) without forcing job `mock-copy` fallbacks. Only start-past-EOF and zero-length windows hard-fail.

Module: `services/worker/src/media/mediaGuard.ts` (`normalizeCutRangeMs`).

---

## 5. Emergency fallback clip

**Bake:** `./scripts/media/bake-demo-fallback.sh`  
**File:** `storage/samples/demo-fallback-clip.mp4` (3s, 720×1280, labeled “CreatorAi demo fallback clip”)

Use when:

- Live `RENDER_CLIP` / `RENDER_TIMELINE` fails and you need a visible Asset for Packs / download.
- ffmpeg is present for packs but a prior render job left no output.

Integration / demo operator:

1. Keep the baked file on disk before the talk.
2. If a render job fails, copy/upload `demo-fallback-clip.mp4` as the project Asset (or point the failed job’s output path at it for local demos).
3. Continue packs (`ADAPT_PLATFORM`) from that Asset — aspect adapt still runs against it.

This is **instructions + a bake script**, not a committed binary (keeps the repo small).

---

## 6. Performance notes (laptop demo)

| Op | Typical on `dummy.mp4` | Notes |
|----|------------------------|-------|
| Thumbnail | &lt;1s | `-ss` before `-i` |
| Extract audio | &lt;1s | 16 kHz mono WAV |
| Cut clip (re-encode) | ~0.5–2s | `ultrafast` / CRF 23 |
| Aspect adapt (×3) | ~1–3s total | center crop default |
| Timeline render (1–2 clips) | ~1–4s | `ultrafast`; drawtext needs fonts |

Tips:

- Prefer **re-encode** cuts for accurate boundaries (`cutClip` default).
- Keep demo sources ≤30s; long 4K sources blow laptop encode time.
- `AI_PROVIDER=mock` avoids network; media path is local-only once ffmpeg is installed.
- STORAGE_ROOT defaults to `./storage` — run API/worker from repo root.

---

## 7. Judges’ go / no-go

- [ ] `./scripts/media/check-ffmpeg.sh` exits 0  
- [ ] `storage/samples/dummy.mp4` exists (~5s)  
- [ ] `storage/samples/demo-fallback-clip.mp4` exists (emergency)  
- [ ] `./scripts/media/verify-media-hardening.sh` exits 0  
- [ ] API can upload `dummy.mp4` and ADAPT_PLATFORM produces distinct dimensions  

If ffmpeg is missing: **stop** and install before the golden path — mock-copy fallbacks exist in some jobs but packs will not show distinct aspect ratios.
