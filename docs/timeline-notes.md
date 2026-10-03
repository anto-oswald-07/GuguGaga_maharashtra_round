# Timeline Notes — CreatorAi

> Owned by Dev D (Cyrus). Phase 1 summary of the editable Edit Timeline JSON from SDD §4.3.
> Implementation package lands in Phase 8: `packages/timeline-schema`.

---

## 1. Why timeline JSON exists

AI-assisted edits must **remain editable** (SRS FR-ED-*, NFR-003). The system stores an edit decision document (timeline JSON), not only a baked MP4.

Rules:

- Rendering always reads this JSON.
- Users edit via UI; AI proposes a **new version**; user must **Apply** (never silent overwrite).
- Schema is versioned (`schemaVersion`).

---

## 2. Conceptual schema (SDD §4.3)

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
          "timelineStartMs": 0
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
  "meta": { "generatedBy": "ai", "prompt": "..." }
}
```

---

## 3. Field cheat sheet

| Field | Meaning |
|-------|---------|
| `schemaVersion` | Contract version (`"1.0"` for MVP) |
| `fps` | Timeline frame rate |
| `durationMs` | Total timeline length |
| `tracks[]` | Parallel layers: `video`, `text`, `captions` (MVP) |
| `tracks[].clips` | Video track source slices (`assetId` + src range + timeline start) |
| `tracks[].items` | Text/caption timed overlays |
| `transitions` | Basic transitions (may be empty in early MVP) |
| `meta` | Provenance (AI vs user, prompt, etc.) |

---

## 4. Track types (MVP)

| `type` | Contents | Renderer expectation (Phase 8) |
|--------|----------|--------------------------------|
| `video` | `clips[]` with asset + trim | FFmpeg concat / trim from originals |
| `text` | `items[]` with style | `drawtext` overlays (minimum required) |
| `captions` | `items[]` timed text | Softsubs (VTT/SRT) and/or burn-in if feasible |

---

## 5. Versioning semantics (API — Phase 8)

- Each user save (`PUT /timelines/:id`) creates a new `TimelineVersion`.
- AI generate stores a proposal (`source=ai_proposal` or equivalent); Apply turns it into the working version.
- Previous versions stay readable (FR-ED-005 is P1; version rows still created).

---

## 6. Phase 8 ownership reminder

| Piece | Owner |
|-------|--------|
| `packages/timeline-schema` (zod + `assertValidTimeline`) | Cyrus |
| `services/worker/src/media/renderTimeline.ts` | Cyrus |
| Timeline editor UI | Brendan |
| Timelines API + versions | Anto |
| `proposeTimeline` AI | Arvin |

This doc is the Phase 1 contract scratchpad until `packages/timeline-schema` ships.
