# Asset Metadata Extraction

> **Owner:** Dev C (Arvin) — Phase 3  
> **Code:** `packages/shared/src/types/assetMetadata.ts`, `services/worker/src/jobs/extractMetadata.ts`  
> **Related:** SDD §8 (ffprobe metadata), assets API (Anto Phase 3 B)

---

## Type: `VideoAssetMetadata`

| Field | Type | Meaning |
|-------|------|---------|
| `durationMs` | `number` | Duration in milliseconds |
| `width` | `number` | Frame width (px) |
| `height` | `number` | Frame height (px) |
| `codec` | `string` | Primary video codec (e.g. `h264`) |

`ExtractedAssetMetadata` adds `source: 'ffprobe' | 'mock'`.

---

## Worker function

```ts
import { extractMetadata } from '../jobs/extractMetadata';

const meta = await extractMetadata('/path/to/video.mp4');
// → { durationMs, width, height, codec, source }
```

- Calls `ffprobe -print_format json -show_format -show_streams`.
- If ffprobe is missing, the file is unreadable, or parse fails → returns **mock** values (`5s`, `1280x720`, `mock-h264`) so jobs stay demo-safe.

### Manual smoke

```bash
./scripts/media/make-dummy-video.sh   # → storage/samples/dummy.mp4
pnpm --filter @creatorai/shared build
pnpm --filter worker extract-meta -- ../../storage/samples/dummy.mp4
# or from repo root with absolute path:
pnpm --filter worker extract-meta -- "$(pwd)/storage/samples/dummy.mp4"
```

Expect `source: "ffprobe"` when FFmpeg is installed; `source: "mock"` otherwise.

---

## How the API enqueues / runs `EXTRACT_METADATA` (Phase 3 Integration)

**Decision (2026-10-03 Integration):** sync MVP — no `Job` table yet.

1. `POST /api/v1/assets` stores the file under `storage/workspaces/{workspaceId}/originals/...` and creates the `Asset` row.
2. For `VIDEO` uploads, the API calls `enrichVideoAsset` inline (`services/api/src/modules/assets/enrich.ts`):
   - `extractMetadata(absolutePath)` from `worker/jobs/extractMetadata` (ffprobe, mock fallback)
   - `generateThumbnail` → `workspaces/{workspaceId}/derivatives/{assetId}/thumb.jpg`
   - If ffmpeg is missing, writes a tiny placeholder JPEG and sets `thumbnailSource: "placeholder"`
3. Persists into `Asset.metadata`:
   `{ durationMs, width, height, codec, metaSource, thumbnailPath, thumbnailSource }`
4. `GET /api/v1/assets/:id/thumbnail` serves the derivative (auth required).

### Future async path

When a Job table exists, prefer enqueueing `EXTRACT_METADATA` / thumbnail jobs instead of blocking the upload response. Prefer async job for real demos so uploads stay fast.

---

## Non-goals (Phase 3 Dev C parallel work)

Dev C did not own API routes during the parallel phase. **Integration** later wired sync enrichment into the assets upload path (see above).

Still out of scope until a later phase:
- Job queue consumer loop / `EXTRACT_METADATA` job rows
- STT / AI calls
- Async enrichment (preferred once Job table exists)
