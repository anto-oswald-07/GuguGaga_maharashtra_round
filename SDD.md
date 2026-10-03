# Software Design Document (SDD)
## CreatorAi — AI-Powered Creator Operating Platform

| Field | Value |
|-------|-------|
| **Document Version** | 1.0 |
| **Project** | CreatorAi |
| **Based on** | `SRS.md` v1.0 |
| **Team** | Brendan Rodrigues, Anto Oswald, Arvin Almeida, Cyrus Selvaraj |
| **Status** | Approved for development |

---

## 1. Introduction

### 1.1 Purpose
This Software Design Document describes *how* CreatorAi will be built to satisfy the SRS. It defines architecture, modules, data models, APIs, AI/media pipelines, UI structure, and ownership boundaries so four developers can work in parallel without stepping on each other.

### 1.2 Design Goals
1. **Modular ownership** — clear package boundaries matching the Development Plan.
2. **Editable AI output** — timelines and mappings stored as structured data, not only rendered binaries.
3. **Async media/AI** — heavy work runs as jobs; UI stays responsive.
4. **Graceful AI fallback** — mock providers when keys are missing.
5. **Demo reliability** — golden path works on a laptop with sample media.

### 1.3 Related Documents
- `SRS.md` — requirements
- `DEVELOPMENT_PLAN.md` — phased build + merge process
- `context.md` — living team log

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                        │
│  Next.js / React App — Dashboard, Library, Project, Editor UI    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST JSON (+ polling)
┌───────────────────────────────▼─────────────────────────────────┐
│                     API Gateway / Backend                        │
│              Node.js (Express or Fastify) + Auth                 │
│  Routes: auth, assets, projects, scripts, maps, clips,          │
│          timelines, packs, jobs, insights                        │
└───────┬─────────────────┬─────────────────┬─────────────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐
│  PostgreSQL  │  │ Object Store │  │      Job Queue             │
│  (metadata)  │  │ (local/S3)   │  │  (BullMQ / Redis or DB)    │
└──────────────┘  └──────────────┘  └──────────────┬─────────────┘
                                                   │
                                      ┌────────────▼────────────┐
                                      │   Media / AI Workers    │
                                      │  - FFmpeg renders       │
                                      │  - Transcription        │
                                      │  - LLM script/hooks     │
                                      │  - Alignment & scoring  │
                                      └────────────┬────────────┘
                                                   │
                                      ┌────────────▼────────────┐
                                      │ External AI Providers   │
                                      │ (OpenAI/Gemini/Whisper) │
                                      │ + MockProvider          │
                                      └─────────────────────────┘
```

### 2.2 Repository Layout (Ownership-Friendly)

```
/
├── SRS.md
├── SDD.md
├── DEVELOPMENT_PLAN.md
├── context.md
├── README.md
├── .env.example
├── docker-compose.yml                 # optional: postgres, redis, minio
├── apps/
│   └── web/                           # Frontend (Next.js)
├── services/
│   ├── api/                           # Backend API
│   └── worker/                        # Job consumers (media + AI)
├── packages/
│   ├── shared/                        # Shared types, zod schemas, constants
│   ├── timeline-schema/               # Edit timeline JSON schema + validators
│   └── ai-provider/                   # LLM/STT interfaces + mock + real
├── storage/                           # Local media store (gitignored)
└── samples/                           # Small demo script + footage notes
```

**Ownership principle:** During a phase, a developer may *only* write production code in their assigned directories. Shared contracts live in `packages/shared` and `packages/timeline-schema` and are changed only when the phase explicitly allows it (or during Integration Mini-Phase with team agreement).

### 2.3 Technology Choices

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Fast UI, good DX, SSR optional |
| Backend | Node.js + Fastify (or Express) + TypeScript | Same language as frontend; shared types |
| DB | PostgreSQL + Prisma ORM | Relational fit for projects/workflows |
| Queue | BullMQ + Redis (fallback: DB-polling queue) | Standard async jobs |
| Storage | Local filesystem adapter + S3-compatible interface | Simple local demo; swap later |
| Media | FFmpeg via fluent-ffmpeg or child_process | Industry standard cutting/resize |
| AI | Provider interface; OpenAI/Gemini + Whisper | Pluggable; mock for offline |
| Auth | JWT (access) + hashed passwords (bcrypt) | Simple MVP auth |
| Validation | Zod | Shared request/response schemas |

---

## 3. Module Design

### 3.1 Module Map

| Module | Path | Responsibility | Primary SRS |
|--------|------|----------------|-------------|
| **Web App** | `apps/web` | UI for all features | All UI FRs |
| **API Auth** | `services/api/src/modules/auth` | Register/login/logout/JWT | FR-AUTH-* |
| **API Assets** | `services/api/src/modules/assets` | Upload/list/tag/delete | FR-AST-* |
| **API Projects/Workflow** | `services/api/src/modules/projects` | Projects + stages | FR-WF-* |
| **API Scripts** | `services/api/src/modules/scripts` | Script CRUD + AI generate endpoints | FR-SCR-* |
| **API Mapping** | `services/api/src/modules/mapping` | Script–footage maps | FR-STV-* |
| **API Clips** | `services/api/src/modules/clips` | Candidates + render requests | FR-CLP-* |
| **API Timeline** | `services/api/src/modules/timelines` | Editable timelines | FR-ED-* |
| **API Packs** | `services/api/src/modules/packs` | Platform adaptation | FR-PLT-* |
| **API Jobs** | `services/api/src/modules/jobs` | Job status API | FR-JOB-* |
| **API Insights** | `services/api/src/modules/insights` | Metrics | FR-INT-* |
| **Worker Media** | `services/worker/src/media` | FFmpeg ops | FR-CLP/ED/PLT |
| **Worker AI** | `services/worker/src/ai` | STT, LLM, alignment | FR-SCR/STV/CLP |
| **Shared** | `packages/shared` | Types, enums, DTO zod | All |
| **Timeline Schema** | `packages/timeline-schema` | Edit JSON contract | FR-ED-* |
| **AI Provider** | `packages/ai-provider` | Provider interface | FR-SCR/STV + NFR-008 |

### 3.2 Developer Default Ownership (Logical)

| Developer | Default Domains |
|-----------|-----------------|
| **Brendan Rodrigues (Dev A)** | Frontend shell, dashboard, workflow UI, project pages, design system |
| **Anto Oswald (Dev B)** | Backend API core, auth, assets, projects, jobs plumbing, DB schema |
| **Arvin Almeida (Dev C)** | AI provider package, scripts/hooks generation, STT, script–video mapping, clip scoring |
| **Cyrus Selvaraj (Dev D)** | Worker media pipeline, FFmpeg renders, timeline schema, editable editor UI+API glue, platform packs |

> Exact per-phase file ownership is defined in `DEVELOPMENT_PLAN.md` and overrides this table when they differ.

---

## 4. Data Design

### 4.1 Entity-Relationship (Logical)

```
User 1──1 Workspace
Workspace 1──* Asset
Workspace 1──* Project
Project *──* Asset                 (ProjectAsset join)
Project 1──* ScriptDocument
ScriptDocument 1──* ScriptVersion
Project 1──* Transcript
Transcript 1──* TranscriptSegment  (startMs, endMs, text)
Project 1──* ScriptFootageMap      (scriptRef, startMs, endMs, confidence)
Project 1──* ClipCandidate
ClipCandidate 0──1 Asset           (rendered clip)
Project 1──* EditTimeline
EditTimeline 1──* TimelineVersion  (json blob)
Project 1──* PlatformPack
PlatformPack *──* Asset            (outputs)
Workspace 1──* Job
Project 1──* StageEvent
Project 1──* EngagementMetric      (manual optional)
```

### 4.2 Key Enums

```ts
enum AssetType { VIDEO, IMAGE, AUDIO, DOCUMENT, OTHER }
enum ProjectStage {
  IDEA, SCRIPT, RECORDED, EDITING, CLIPS, ADAPTED, READY, PUBLISHED
}
enum JobType {
  TRANSCRIBE, ALIGN_SCRIPT, SCORE_CLIPS, RENDER_CLIP,
  RENDER_TIMELINE, ADAPT_PLATFORM, GENERATE_SCRIPT
}
enum JobStatus { QUEUED, RUNNING, SUCCEEDED, FAILED }
enum Platform {
  YOUTUBE, YOUTUBE_SHORTS, INSTAGRAM_REELS, TIKTOK, LINKEDIN
}
enum AspectRatio { R_16_9, R_9_16, R_1_1 }
```

### 4.3 Edit Timeline JSON (Conceptual Schema)

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

**Rule:** Rendering always reads this JSON. Users edit JSON via UI. AI proposes a new version; user must Apply.

### 4.4 Storage Layout

```
storage/
  workspaces/{workspaceId}/
    originals/{assetId}/{filename}
    derivatives/{assetId}/thumb.jpg
    renders/{jobId}/output.mp4
    captions/{assetId}/captions.vtt
```

DB stores URLs/paths; binaries live in object store.

---

## 5. API Design

Base URL: `/api/v1`  
Auth: `Authorization: Bearer <jwt>` unless noted.

### 5.1 Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create user |
| POST | `/auth/login` | Get JWT |
| POST | `/auth/logout` | Client discard (+ optional blacklist) |
| GET | `/auth/me` | Current user |

### 5.2 Assets
| Method | Path | Description |
|--------|------|-------------|
| POST | `/assets` | Multipart upload |
| GET | `/assets` | List/filter `?type=&q=&tag=` |
| GET | `/assets/:id` | Detail + metadata |
| PATCH | `/assets/:id` | Update name/tags/description |
| DELETE | `/assets/:id` | Soft delete |
| GET | `/assets/:id/content` | Stream/download |

### 5.3 Projects & Workflow
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects` | Create |
| GET | `/projects` | List |
| GET | `/projects/:id` | Detail |
| PATCH | `/projects/:id` | Update fields |
| POST | `/projects/:id/stage` | `{ stage }` transition |
| POST | `/projects/:id/assets` | Attach asset IDs |
| GET | `/projects/:id/stage-history` | Stage events |

### 5.4 Scripts
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/scripts` | Create/save script |
| GET | `/projects/:id/scripts` | List scripts |
| POST | `/projects/:id/scripts/generate` | Enqueue AI generation |
| POST | `/scripts/:id/hooks` | Generate hook variants |
| POST | `/scripts/:id/supporting` | Titles/captions/hashtags |
| POST | `/scripts/:id/versions` | Save new version |

### 5.5 Mapping / Transcription
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/transcribe` | Job: transcribe asset |
| GET | `/projects/:id/transcripts` | List |
| POST | `/projects/:id/align` | Job: align script↔transcript |
| GET | `/projects/:id/mappings` | Get mappings |
| PATCH | `/mappings/:id` | Manual correction |

### 5.6 Clips
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/clips/propose` | Job: score candidates |
| GET | `/projects/:id/clips/candidates` | List candidates |
| PATCH | `/clips/candidates/:id` | Tweak times / accept / reject |
| POST | `/clips/candidates/:id/render` | Job: FFmpeg cut |

### 5.7 Timelines
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/timelines/generate` | Job: AI timeline proposal |
| GET | `/projects/:id/timelines` | List |
| GET | `/timelines/:id` | Current version JSON |
| PUT | `/timelines/:id` | Save user edits (new version) |
| POST | `/timelines/:id/render` | Job: render preview |

### 5.8 Platform Packs
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/packs/generate` | Job: adapt for platforms |
| GET | `/projects/:id/packs` | List packs |
| PATCH | `/packs/:id/status` | Draft/Ready/Published |
| GET | `/packs/:id/download` | Zip or file links |

### 5.9 Jobs & Insights
| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | List jobs for workspace |
| GET | `/jobs/:id` | Status + error |
| POST | `/jobs/:id/retry` | Retry failed |
| GET | `/insights/overview` | Production metrics |
| POST | `/insights/engagement` | Manual metrics entry |

### 5.10 Error Shape
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

---

## 6. Background Job Design

### 6.1 Job Record
- `id`, `workspaceId`, `projectId?`, `type`, `status`
- `input` (JSON), `output` (JSON), `error` (string)
- `progress` (0–100), `createdAt`, `updatedAt`

### 6.2 Worker Flow
1. API creates Job `QUEUED` and enqueues message.
2. Worker claims job → `RUNNING`.
3. Worker updates `progress` periodically.
4. On success: write artifacts (assets/paths), set `SUCCEEDED`, store `output`.
5. On failure: set `FAILED`, store message; leave partial artifacts cleaned or marked.

### 6.3 Idempotency
- Render jobs keyed by `(candidateId, paramsHash)` when possible.
- Re-running generate creates a new timeline *version*, never silent overwrite.

---

## 7. AI Subsystem Design

### 7.1 Provider Interface
```ts
interface AiProvider {
  generateScript(input: ScriptGenInput): Promise<ScriptGenResult>;
  generateHooks(script: string, n: number): Promise<string[]>;
  generateSupporting(script: string, platforms: Platform[]): Promise<SupportingContent>;
  alignScriptToTranscript(script: ScriptDoc, segments: TranscriptSegment[]): Promise<Alignment[]>;
  scoreClipWindows(transcript: Transcript, script: ScriptDoc): Promise<ClipIdea[]>;
  proposeTimeline(ctx: TimelineContext): Promise<EditTimeline>;
}
```

Implementations:
- `MockAiProvider` — deterministic fixtures for demos/tests.
- `OpenAiProvider` / `GeminiProvider` — real calls.

### 7.2 Transcription
- Prefer Whisper API or local whisper.cpp.
- Output normalized `TranscriptSegment[]`.

### 7.3 Alignment Strategy (MVP)
1. Embed or fuzzy-match script sentences to transcript windows.
2. Produce `startMs/endMs/confidence`.
3. Mark low-confidence for UI flags (FR-STV-006).

### 7.4 Clip Scoring (MVP)
- Rank windows by: hook keywords, sentiment/energy proxies, sentence completeness, duration fitness (15–60s).
- Return top N candidates.

---

## 8. Media Pipeline Design

| Operation | Tooling | Input | Output |
|-----------|---------|-------|--------|
| Thumbnail | FFmpeg | video | JPEG |
| Metadata | ffprobe | video/audio | JSON fields |
| Cut clip | FFmpeg `-ss -to -c copy` (or re-encode) | video + range | MP4 asset |
| Captions burn/sidecar | FFmpeg / file write | timeline/transcript | VTT/SRT (+ optional burn) |
| Aspect adapt | FFmpeg crop/scale/pad | video + ratio | MP4 |
| Timeline render | FFmpeg filter_complex from timeline JSON | timeline | preview MP4 |

**Design rule:** A pure function `timelineToFfmpegPlan(timeline) -> commands` lives in worker; unit-testable without GPU.

---

## 9. Frontend Design

### 9.1 Route Map
| Route | Page |
|-------|------|
| `/login`, `/register` | Auth |
| `/` | Dashboard |
| `/assets` | Asset library |
| `/projects` | Project list |
| `/projects/[id]` | Project hub (tabs) |
| `/projects/[id]/editor` | Timeline editor |
| `/workflow` | Kanban board |
| `/jobs` | Job center |
| `/insights` | Intelligence |

### 9.2 Project Hub Tabs
1. Overview (stage, targets)
2. Script
3. Footage & Mapping
4. Clips
5. Timeline
6. Platform Packs

### 9.3 Timeline Editor UX Principles
- Left: media/clip bin
- Center: preview player
- Bottom: tracks (video/text/captions)
- Right: inspector for selected item
- “AI Suggest” opens a diff/proposal panel → Apply / Dismiss

### 9.4 State Management
- Server state: TanStack Query (fetch/cache/poll jobs).
- Local editor state: React state or Zustand for timeline draft before save.

---

## 10. Security Design
- Passwords hashed with bcrypt.
- JWT signed with server secret; short TTL acceptable for MVP.
- Authorize every resource by `workspaceId === user.workspaceId`.
- Validate uploads by MIME + extension allowlist.
- Rate-limit AI endpoints lightly.
- No secrets in client bundle.

---

## 11. Observability
- Structured logs: `{ level, msg, requestId, jobId }`.
- Job failures visible in UI.
- Health endpoint: `GET /api/v1/health`.

---

## 12. Deployment (Demo)
- `docker-compose up` for Postgres (+ Redis if used).
- `pnpm` or `npm` workspaces to run `web`, `api`, `worker`.
- `.env.example` documents all variables.
- Sample project seed script optional for judges.

---

## 13. Design Decisions Log

| Decision | Choice | Why |
|----------|--------|-----|
| Editable AI edits | Timeline JSON + versions | Satisfies “remain editable” |
| Jobs for heavy work | Queue + worker | Avoid HTTP timeouts |
| Shared Zod schemas | `packages/shared` | Independent teams share contracts |
| Mock AI provider | Always available | NFR-008 demo resilience |
| Soft delete | Assets/projects | Safer demos |
| Polling for jobs | Every 2s on active pages | Simpler than WebSockets for MVP |

---

## 14. Open Design Items (Resolve in Phase 1 Integration)
1. Exact monorepo tool: `pnpm` workspaces vs `npm` workspaces.
2. Queue: Redis+BullMQ vs DB-backed queue if Redis setup is slow.
3. Default AI vendor for the event account.

These must be decided and written into `context.md` during Phase 1 Integration Mini-Phase.
