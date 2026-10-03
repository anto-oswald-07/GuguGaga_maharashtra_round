# Timeline Notes — CreatorAi (FINAL)

> Owned by Dev D (Cyrus). **FINAL** for Phase 8 — implementation lives in
> `@creatorai/timeline-schema` + `services/worker/src/media/renderTimeline.ts`.

---

## 1. Why timeline JSON exists

AI-assisted edits must **remain editable** (SRS FR-ED-*, NFR-003). The system stores an edit decision document (timeline JSON), not only a baked MP4.

Rules:

- Rendering always reads this JSON.
- Users edit via UI; AI proposes a **new version**; user must **Apply** (never silent overwrite).
- Schema is versioned (`schemaVersion`).

---

## 2. Schema contract (`schemaVersion: "1.0"`)

Package: `@creatorai/timeline-schema`

```ts
import {
  assertValidTimeline,
  editTimelineSchema,
  safeParseTimeline,
  type EditTimeline,
} from '@creatorai/timeline-schema';

const tl = assertValidTimeline(rawJson); // throws TimelineValidationError
```

Canonical shape (SDD §4.3):

```json
{
  "schemaVersion": "1.0",
  "fps": 30,
  "durationMs": 45000,
  "tracks": [
    {
      "id": "v1",
      "type": "video",
      "clips": [
        {
          "id": "c1",
          "assetId": "uuid",
          "srcStartMs": 12000,
          "srcEndMs": 28000,
          "timelineStartMs": 0,
          "label": "optional"
        }
      ]
    },
    {
      "id": "t1",
      "type": "text",
      "items": [
        {
          "id": "tx1",
          "text": "HOOK HERE",
          "startMs": 0,
          "endMs": 2500,
          "style": { "position": "bottom", "fontSize": 48 }
        }
      ]
    },
    {
      "id": "cap1",
      "type": "captions",
      "items": [
        { "id": "s1", "text": "Hello creators", "startMs": 0, "endMs": 1800 }
      ]
    }
  ],
  "transitions": [],
  "meta": { "generatedBy": "ai", "prompt": "...", "notes": "..." }
}
```

Validation rules (Zod):

- `schemaVersion` must be exactly `"1.0"`
- At least one `video` track with ≥1 clip
- Each clip: `srcEndMs > srcStartMs`
- Each text/caption item: `endMs > startMs`
- `meta.generatedBy`: `ai` | `user` | `system` | `mock`

Fixtures / tests: `packages/timeline-schema/test/fixtures/**` + `pnpm --filter @creatorai/timeline-schema test`.

---

## 3. Field cheat sheet

| Field | Meaning |
|-------|---------|
| `schemaVersion` | Contract version (`"1.0"` for MVP) |
| `fps` | Timeline frame rate |
| `durationMs` | Total timeline length |
| `tracks[]` | Parallel layers: `video`, `audio`, `text`, `captions` |
| `tracks[].clips` | Video/audio track source slices (`assetId` + src range + timeline start) |
| `clips[].mediaKind` | Optional `video` \| `image` on video-track clips (images hold stills) |
| `tracks[].items` | Text/caption timed overlays |
| `transitions` | Basic transitions (may be empty in early MVP) |
| `meta` | Provenance (AI vs user, prompt, notes) |

---

## 4. Track types → renderer

| `type` | Contents | Renderer (`renderTimeline.ts`) |
|--------|----------|--------------------------------|
| `video` | `clips[]` | Video: `trim` + `concat`. Images (`mediaKind: "image"`): loop still for `(srcEndMs - srcStartMs)` + silence. Sorted by `timelineStartMs`; needs `assetPaths[assetId]` |
| `audio` | `clips[]` | `atrim` + `adelay` by `timelineStartMs`, then `amix` with the visual track audio |
| `text` | `items[]` + style | **`drawtext` overlays** (required MVP) |
| `captions` | `items[]` | Softsubs: write sibling `.srt`, mux `mov_text`; optional `--burn-captions` |

**Assumptions (MVP):**

- Visual clips are treated as a contiguous concat in `timelineStartMs` order (gaps not filled with black).
- Video source media should include an audio stream when used as video clips (demo `dummy.mp4` does). Image stills synthesize silence; dedicated audio-track clips supply the soundtrack.
- Default output size 1280×720 (letterboxed).

---

## 5. Render path + consumer

```
storage/workspaces/{workspaceId}/renders/{jobId}/output.mp4
(+ sibling .srt when captions present)
```

Helper: `renderTimelinePath(storageRoot, workspaceId, jobId)`.

Consumer: `services/worker/src/consumers/renderTimeline.ts` (`RENDER_TIMELINE`).

Job output JSON:

```json
{
  "outputPath": "storage/.../renders/.../output.mp4",
  "softsubsPath": "storage/.../renders/.../output.srt",
  "durationMs": 2000,
  "clipCount": 1,
  "textOverlayCount": 1,
  "captionCount": 1
}
```

Smoke:

```bash
pnpm --filter @creatorai/timeline-schema test
# from repo root, with dummy.mp4:
pnpm --filter worker render-timeline -- \
  --timeline packages/timeline-schema/test/fixtures/valid-timeline.json \
  --asset dummy-asset=storage/samples/dummy.mp4 \
  --output storage/samples/dummy-timeline.mp4
```

---

## 6. Versioning semantics (API — Phase 8 B)

- Each user save (`PUT /timelines/:id`) creates a new `TimelineVersion`.
- AI generate stores a proposal; Apply turns it into the working version.
- Previous versions stay readable (FR-ED-005 is P1; version rows still created).
- API should call `assertValidTimeline` / `safeParseTimeline` before persist.

---

## 7. Ownership

| Piece | Owner |
|-------|--------|
| `packages/timeline-schema` (zod + `assertValidTimeline`) | Cyrus — **done** |
| `services/worker/src/media/renderTimeline.ts` | Cyrus — **done** |
| `services/worker/src/consumers/renderTimeline.ts` | Cyrus — **done** |
| Timeline editor UI | Brendan |
| Timelines API + versions | Anto |
| `proposeTimeline` AI | Arvin |

AI `proposeTimeline` optionally peer-calls `assertValidTimeline` when this package is installed.
