# CreatorAi — Job Queue (Phase 5)

> **Owner:** Dev B (Anto)  
> **Decision:** **DB-polling queue for MVP.** Worker writes results **directly to Postgres** (same Prisma models). No HTTP webhook from worker → API required for Phase 5.

## Why DB polling

Phase 1 Integration chose DB-polling over BullMQ for the hackathon MVP. Redis remains optional in compose (`--profile redis`) for a later BullMQ cutover.

## Flow

1. **API producer** (`enqueueJob`): inserts `Job` with `status=QUEUED`, `progress=0`, JSON `input`.
2. **Worker consumer** (Arvin Phase 5 C): poll `WHERE status='QUEUED' ORDER BY createdAt ASC`, claim with `UPDATE … SET status='RUNNING' … WHERE id=? AND status='QUEUED'`, run provider, write artifacts, set `SUCCEEDED` + `output` (or `FAILED` + `error`).
3. **UI**: poll `GET /api/v1/jobs/:id` until terminal status.

## Worker update path (chosen)

| Option | Chosen? | Notes |
|--------|---------|-------|
| Worker writes DB directly | **Yes** | Shared schema; simplest for monorepo |
| Worker PATCHes internal API | No (MVP) | Would need service token; defer |
| API webhook from worker | No | Extra hop |

`POST /api/v1/jobs/:id/mock-complete` mirrors the worker path for UI testing / fail injection. **Phase 5 Integration** runs an in-process DB poller in the API (`startJobPoller`) that claims `QUEUED` jobs and completes them with `@creatorai/ai-provider` (default `mock`). Worker CLI (`pnpm --filter worker generate-script`) remains for local smoke without the Job table.

## Job types (Phase 5+)

| Type | Producer | Artifact |
|------|----------|----------|
| `GENERATE_SCRIPT` | `POST /projects/:id/scripts/generate` | `ScriptDocument` + `ScriptVersion` (`source=AI` or `REFINE`) |
| `GENERATE_HOOKS` | `POST /scripts/:id/hooks` | Job `output.hooks: string[]` |
| `GENERATE_SUPPORTING` | `POST /scripts/:id/supporting` | Job `output.supporting` |
| `TRANSCRIBE` | `POST /projects/:id/transcribe` | `Transcript` + `TranscriptSegment[]` |
| `ALIGN_SCRIPT` | `POST /projects/:id/align` | `ScriptFootageMap[]` (replaces prior AI maps for script+transcript) |
| Others (render, packs, …) | Later phases | — |

## Phase 6 mapping notes

- Manual correction: `PATCH /api/v1/mappings/:id` sets `source=USER`.
- Low confidence: `confidence < 0.55` → DTO `lowConfidence: true` (`LOW_CONFIDENCE_THRESHOLD` in `@creatorai/shared`).
- Until Arvin Phase 6 C lands Whisper + fuzzy align, the API poller uses deterministic mock STT/align so Brendan’s Mapping UI can e2e.

## Phase 7 clips notes

| Type | Producer | Artifact |
|------|----------|----------|
| `SCORE_CLIPS` | `POST /projects/:id/clips/propose` | `ClipCandidate[]` (`status=proposed`); replaces prior **proposed** rows for same project+sourceAsset |
| `RENDER_CLIP` | `POST /clips/candidates/:id/render` | Cut MP4 under `renders/{jobId}/output.mp4` → new `Asset` linked via `ClipCandidate.renderedAssetId` (`status=rendered`) |

- Candidate statuses: `proposed` → `accepted`/`rejected` (PATCH) → `rendered` (RENDER_CLIP).
- Render may auto-accept a still-`proposed` candidate (demo convenience).
- Scorer: `AiProvider.scoreClipWindows` (Arvin); fallback `mockClipIdeas` (3 candidates).
- Cutter: `cutClip` reencode (Cyrus); fallback copies source file if ffmpeg missing.

## Phase 8 timelines notes

| Type | Producer | Artifact |
|------|----------|----------|
| `GENERATE_TIMELINE` | `POST /projects/:id/timelines/generate` | `TimelineVersion` with `source=AI_PROPOSAL` — **does not** change `currentVersionId` |
| `RENDER_TIMELINE` | `POST /timelines/:id/render` | Preview MP4 under `renders/{jobId}/timeline-preview.mp4` → Asset + `EditTimeline.previewAssetId` |

### Apply semantics (FR-ED-006)

1. Generate stores a **proposal** version only (`source=AI_PROPOSAL`).
2. **Apply** = `PUT /timelines/:id` with body `{ "timeline": <json> }` (proposal JSON or user edits).
3. PUT always appends a new `USER` version and sets `currentVersionId` — never overwrites prior rows.
4. Render uses the **current** (applied) version only; fails if none applied yet.

UI Suggest panel: read `pendingProposal` / `pendingProposalVersionId` from GET; Apply → PUT; Dismiss → ignore.

Lightweight Zod validation lives in `@creatorai/shared` (`editTimelineJsonSchema`) until Cyrus’s `packages/timeline-schema` lands.

## Phase 9 platform copy notes

| Type | Producer | Artifact |
|------|----------|----------|
| `GENERATE_SUPPORTING` / pack copy | Packs generate (Anto 9 B) or worker CLI | `SupportingContent.byPlatform` titles/captions/hashtags |

- Builder: `AiProvider.generateSupporting` (Arvin 9 C) — soft length limits in `docs/ai/platform-copy-guidelines.md`
- CLI smoke: `pnpm --filter worker generate-platform-copy -- --fixture`
- Aspect adaptation (Cyrus 9 D) is separate (`adaptAspect`); copy + aspect combine in Packs Integration

## Script content shape

```json
{ "hook": "...", "body": "...", "cta": "...", "title": "...", "rawText": "..." }
```

Shared Zod: `@creatorai/shared` → `scriptContentSchema` (`packages/shared/src/scripts.ts`).
