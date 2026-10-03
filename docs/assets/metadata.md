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

## How the API will enqueue `EXTRACT_METADATA` (future / Integration)

Anto’s assets upload (Phase 3 B) should **not** block the HTTP response on ffprobe. Recommended MVP flow:

1. `POST /api/v1/assets` stores the file under `storage/workspaces/{workspaceId}/originals/...` and creates the `Asset` row (`metadata` JSON null or `{}`).
2. API creates a `Job` row:
   - `type`: `EXTRACT_METADATA` (extend `JobType` enum / string union; not in SDD §4.2 yet — add at Integration)
   - `status`: `QUEUED`
   - `input`: `{ assetId, filePath }` (path relative to `STORAGE_ROOT` or absolute)
   - `workspaceId` from `request.auth`
3. Worker (DB-poll MVP, per Phase 1 Integration decision) claims the job → `RUNNING`.
4. Worker calls `extractMetadata(filePath)`.
5. On success:
   - Patch `Asset.metadata` with `{ durationMs, width, height, codec }` (omit or keep `source` for debug)
   - Set job `SUCCEEDED`, store output JSON
6. On unexpected throw (should be rare — extractMetadata itself mocks on probe failure):
   - Job `FAILED` with message; leave asset metadata empty

### Sync fallback (optional for Integration)

If queue wiring is not ready, API may call `extractMetadata` **inline** after upload for video MIME types only, then persist metadata in the same request. Prefer async job for real demos so uploads stay fast.

### Auth / tenancy

- Only enqueue for assets in the caller’s `workspaceId`.
- Worker must re-check workspace ownership before writing metadata.

### Thumbnail coordination (Dev D)

After metadata (or in parallel), Cyrus’s thumbnail job can use the same asset path. Metadata does not depend on thumbnails.

---

## Non-goals this phase

- No API route changes (Anto owns assets API).
- No queue consumer loop yet (Phase 5+ / Integration wiring).
- No STT / AI calls.
