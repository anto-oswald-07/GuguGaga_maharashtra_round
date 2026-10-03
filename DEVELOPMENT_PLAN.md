# CreatorAi — Development Plan

| Field | Value |
|-------|-------|
| **Document Version** | 1.0 |
| **Project** | CreatorAi |
| **Based on** | `SRS.md` v1.0, `SDD.md` v1.0 |
| **Team Size** | 4 independent developers |
| **Phases** | 10 build phases + 10 integration mini-phases |

---

## 0. How to Use This Document (Read This First)

### 0.1 The Four Developers

| Code | Name | Short Name Used Below |
|------|------|------------------------|
| **Dev A** | Brendan Rodrigues | Brendan |
| **Dev B** | Anto Oswald | Anto |
| **Dev C** | Arvin Almeida | Arvin |
| **Dev D** | Cyrus Selvaraj | Cyrus |

### 0.2 Golden Rules of Parallel Work

1. **No talking to each other during a phase** about implementation details, file contents, or “quick fixes” in someone else’s folder. You only sync in the **Integration Mini-Phase**.
2. **You may only edit files inside your Allowed Paths** for that phase. If you need something outside your paths, write a **NEED** note in `context.md` and wait for Integration.
3. **Before you start any work in a phase**, read the entire `context.md` from top to latest entry.
4. **After every meaningful action** (create folder, add dependency, finish a feature, hit a blocker), append an entry to `context.md` using the template in Section 0.5.
5. **Do not invent new shared types** in your private folders if they belong in `packages/shared`. If the shared package is not yours this phase, use a temporary local type and mark `TODO_SHARED:` in `context.md`.
6. **Do not merge git branches yourself mid-phase.** Each developer works on their own branch. Merging happens only in Integration.
7. **Dummy down everything:** if the task says “create file X with contents Y,” do exactly that. Do not “improve” another developer’s contract.
8. **At phase start**, create your branch from the latest `main` after the previous Integration finished:
   ```bash
   git checkout main
   git pull
   git checkout -b phase-<N>-<yourname>
   ```
9. **At phase end (before Integration)**, push your branch and fill the Phase Completion Checklist in `context.md`.
10. **If you are blocked**, do not wait silently. Add a `BLOCKER` entry to `context.md` with what you need and a temporary workaround you used.

### 0.3 Branch Naming

```
phase-01-brendan
phase-01-anto
phase-01-arvin
phase-01-cyrus
phase-02-brendan
...
```

Integration branch (created during mini-phase by whoever is Integration Lead that phase):

```
phase-01-integration
```

### 0.4 Integration Mini-Phase Rules

After every phase (1–10), there is an **Integration Mini-Phase**. During Integration:

1. All four developers meet (call / same room).
2. Integration Lead for that phase creates `phase-XX-integration` from `main`.
3. Merge order is **always**: Anto → Arvin → Cyrus → Brendan  
   (backend/contracts first, then AI, then media/timeline, then UI last).
4. Fix conflicts together. Prefer keeping shared contracts from Anto/Arvin.
5. Run the **Integration Verification Checklist** for that phase (listed under each phase).
6. Update `context.md` with “INTEGRATION COMPLETE — Phase N”.
7. Merge `phase-XX-integration` into `main`.
8. Tag: `git tag phase-N-done`.

**Integration Lead rotation:**

| After Phase | Integration Lead |
|-------------|------------------|
| 1 | Anto |
| 2 | Brendan |
| 3 | Arvin |
| 4 | Cyrus |
| 5 | Anto |
| 6 | Brendan |
| 7 | Arvin |
| 8 | Cyrus |
| 9 | Anto |
| 10 | Brendan |

### 0.5 Mandatory `context.md` Entry Format

Every developer appends entries like this (never delete old entries):

```md
### [YYYY-MM-DD HH:MM] ROLE=<A|B|C|D> NAME=<name> PHASE=<N> TYPE=<START|PROGRESS|DONE|NEED|BLOCKER|DECISION|INTEGRATION>
- **Summary:** one sentence
- **Files touched:** list paths
- **APIs / types added:** list
- **How to run / test what I did:** exact commands
- **Depends on:** what I assumed exists from others
- **Needs from others:** empty or specific asks
- **Risks:** empty or notes
```

### 0.6 Recommended Tooling Setup (Everyone Does Once Before Phase 1)

1. Install Node.js 20+.
2. Install `pnpm` (preferred) or use `npm` if team decides in Phase 1 Integration.
3. Install Git.
4. Install FFmpeg and confirm: `ffmpeg -version`.
5. Install Docker (optional but recommended for Postgres/Redis).
6. Clone repo; read `SRS.md`, `SDD.md`, this plan, `context.md`.
7. Create personal `.env` from `.env.example` once it exists (Phase 1).

### 0.7 Definition of Done (Each Developer Task)

A task is done only when:
- Code compiles / typechecks in your package.
- You wrote a short test or a manual test note in `context.md`.
- You updated `context.md`.
- You did not modify forbidden paths.
- Your README snippet (if any) is in your package folder.

---

## Phase Overview (Map)

| Phase | Goal (one line) | Theme |
|-------|-----------------|-------|
| 1 | Monorepo skeleton, shared contracts bootstrap, empty apps | Foundation |
| 2 | Auth + database users + login/register UI | Identity |
| 3 | Asset upload/storage + asset library UI + metadata | Assets |
| 4 | Projects + workflow stages + kanban/project UI | Workflow |
| 5 | AI provider + script/hook generation API + script UI | Scripts |
| 6 | Transcription + script–footage mapping | Understanding |
| 7 | Clip proposal + FFmpeg clip render + clips UI | Clips |
| 8 | Editable timeline schema + editor UI + timeline render | Editing |
| 9 | Platform packs adaptation + publish status | Multi-platform |
| 10 | Insights dashboard + polish + golden-path demo | Intelligence + Demo |

---

# PHASE 1 — Foundation (Monorepo, Tooling, Shared Stubs)

**Goal:** Empty-but-runnable skeleton so later phases plug into known folders.  
**Duration guide:** 1 unit of work (e.g., half-day / day — scale to your event).  
**Integration Lead after phase:** Anto

## Phase 1 — Shared Decisions Locked Before Coding

These are already decided in SDD. Do **not** reopen during the phase:
- Repo layout exactly as SDD Section 2.2.
- TypeScript everywhere possible.
- API base path `/api/v1`.
- Package manager: start with **pnpm workspaces**. If install fails for someone, Integration will decide fallback.

## Phase 1 — Dev A (Brendan) — Frontend Shell Only

### Allowed Paths
- `apps/web/**`
- `apps/web/README.md`
- You may **read** but not edit: `SRS.md`, `SDD.md`, `DEVELOPMENT_PLAN.md`, `context.md` (you may append only)

### Forbidden
- Anything under `services/`, `packages/`, `docker-compose.yml` (except reading)

### Step-by-step Tasks
1. Create Next.js TypeScript app in `apps/web` with App Router and Tailwind.
2. Create placeholder pages (empty content OK, but routes must exist):
   - `/login`, `/register`, `/`, `/assets`, `/projects`, `/projects/[id]`, `/projects/[id]/editor`, `/workflow`, `/jobs`, `/insights`
3. Create a minimal layout with top nav links to those routes and brand text **CreatorAi**.
4. Add a `apps/web/.env.example` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`.
5. Add `apps/web/README.md` with: how to install, how to run (`pnpm --filter web dev` or equivalent).
6. Ensure `pnpm-workspace.yaml` / root package will see `apps/web` — **if root workspace file is Anto’s job, do not create it; instead document in context that you need workspace wiring**.
7. Commit on your branch. Append `context.md`.

### Deliverables Checklist
- [ ] Next app runs and shows nav
- [ ] All routes listed above resolve (can be stub “Coming soon”)
- [ ] README exists

### Manual Test
```bash
cd apps/web && pnpm install && pnpm dev
# open browser, click each nav link
```

---

## Phase 1 — Dev B (Anto) — Repo Tooling + API Stub + DB Bootstrap

### Allowed Paths
- Root: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`, `docker-compose.yml`, `README.md` (append run instructions only; do not delete team names)
- `services/api/**`
- `packages/shared/**` (create stub package only)

### Forbidden
- `apps/web/**` (except reading)
- `services/worker/**`
- AI/timeline packages beyond empty stub if needed — **do not create `packages/ai-provider` or `packages/timeline-schema` yet** (those are Phase 5/8). You **do** create `packages/shared`.

### Step-by-step Tasks
1. Create root workspace:
   - `package.json` private monorepo
   - `pnpm-workspace.yaml` including `apps/*`, `services/*`, `packages/*`
2. Create `.gitignore`: `node_modules`, `.env`, `storage/`, `dist`, `.next`, coverage, OS junk.
3. Create `docker-compose.yml` with **PostgreSQL** (and **Redis** optional). Document ports.
4. Create `packages/shared`:
   - `package.json`, `tsconfig.json`
   - `src/index.ts` exporting placeholder types: `HealthResponse`, `ApiError`
   - `src/constants.ts` with `API_PREFIX = '/api/v1'`
5. Create `services/api`:
   - Fastify or Express + TypeScript
   - `GET /api/v1/health` returns `{ status: 'ok', service: 'api' }`
   - Prisma init with empty schema comment OR Userless Health-only for now
   - Script `dev` on port **4000**
6. Root `.env.example` with `DATABASE_URL`, `JWT_SECRET`, `PORT=4000`, `STORAGE_ROOT=./storage`
7. Update root `README.md` with how to start Postgres and API.
8. Append `context.md`.

### Deliverables Checklist
- [ ] `pnpm install` works at root
- [ ] API health endpoint works
- [ ] docker-compose Postgres starts
- [ ] shared package builds

### Manual Test
```bash
docker compose up -d
pnpm install
pnpm --filter api dev
curl http://localhost:4000/api/v1/health
```

---

## Phase 1 — Dev C (Arvin) — Samples + AI Stub Notes + Worker Placeholder Dir

### Allowed Paths
- `samples/**`
- `services/worker/**` (skeleton only — no real jobs yet)
- `docs/ai-contracts.md` (create this file; your notes for later phases)

### Forbidden
- `apps/web/**`, `services/api/**`, `packages/shared/**` production edits
- Do not implement real AI calls yet

### Step-by-step Tasks
1. Create `samples/README.md` describing a demo content pack:
   - Ideal footage length (< 3 min for demos)
   - Example topic: “How I batch-create Reels in one afternoon”
   - Placeholder script text file `samples/scripts/sample_script.md`
2. Create `samples/scripts/sample_script.md` with Hook / Body / CTA sections.
3. Create worker skeleton `services/worker`:
   - `package.json`, `tsconfig.json`
   - `src/index.ts` that prints `worker skeleton started` and exits or stays idle
   - `README.md` saying “jobs come in Phase 6+”
4. Write `docs/ai-contracts.md` listing the intended `AiProvider` method names from SDD (copy from SDD; do not implement).
5. Append `context.md` with exact sample script path.

### Deliverables Checklist
- [ ] Sample script exists
- [ ] Worker package installs and runs skeleton
- [ ] AI contracts doc exists

---

## Phase 1 — Dev D (Cyrus) — Storage Folder + FFmpeg Probe Script + Timeline Notes

### Allowed Paths
- `storage/.gitkeep`
- `scripts/media/**`
- `docs/ffmpeg-notes.md`
- `docs/timeline-notes.md`

### Forbidden
- Application feature code in api/web
- Do not add heavy binary sample videos to git (link/instructions only)

### Step-by-step Tasks
1. Create `storage/.gitkeep` and document folder meaning in `docs/ffmpeg-notes.md`.
2. Create `scripts/media/check-ffmpeg.sh` that runs `ffmpeg -version` and `ffprobe -version` and exits non-zero if missing.
3. Create `scripts/media/make-dummy-video.sh` that generates a **tiny** test mp4 with ffmpeg (color bars + sine audio, 5 seconds) into `storage/samples/dummy.mp4` (path gitignored except instructions).
4. Write `docs/timeline-notes.md` summarizing the timeline JSON from SDD (for Phase 8).
5. Append `context.md` with how to generate dummy video.

### Deliverables Checklist
- [ ] FFmpeg check script works on your machine
- [ ] Dummy video script works
- [ ] Docs written

---

## PHASE 1 — Integration Mini-Phase

**Lead:** Anto  
**Merge order:** Anto → Arvin → Cyrus → Brendan

### Integration Steps (Do In Order)
1. Create branch `phase-01-integration` from `main`.
2. Merge `phase-01-anto`. Fix workspace so `shared`, `api`, `worker`, `web` are all visible.
3. Merge `phase-01-arvin`. Ensure worker is in workspace.
4. Merge `phase-01-cyrus`. Ensure scripts are executable (`chmod +x`).
5. Merge `phase-01-brendan`. Fix any root script names so `web` runs via workspace.
6. Verify checklist below.
7. Write INTEGRATION entry in `context.md`.
8. Merge to `main`, tag `phase-1-done`.

### Integration Verification Checklist
- [ ] `pnpm install` at root succeeds
- [ ] `curl` health OK
- [ ] `pnpm --filter web dev` starts
- [ ] `pnpm --filter worker dev` (or start) runs skeleton
- [ ] `scripts/media/check-ffmpeg.sh` OK on at least one machine
- [ ] Decide and record in `context.md`: package manager final, Redis yes/no for MVP queue

---

# PHASE 2 — Authentication & Users

**Goal:** Users can register, login, access `/auth/me`; frontend has working auth screens.  
**Integration Lead:** Brendan

## Phase 2 — Dev A (Brendan) — Auth UI

### Allowed Paths
- `apps/web/app/login/**`
- `apps/web/app/register/**`
- `apps/web/components/auth/**`
- `apps/web/lib/api.ts` (create thin fetch helper)
- `apps/web/lib/auth-storage.ts` (token in localStorage)
- `apps/web/app/(app)/layout.tsx` or equivalent guard stub

### Tasks
1. Build Register form: email, password, name → `POST /api/v1/auth/register`.
2. Build Login form → `POST /api/v1/auth/login`, store JWT.
3. On success, redirect to `/`.
4. Create `lib/api.ts` that attaches `Authorization` header if token exists.
5. If API returns error, show message on form.
6. Add Logout button in nav that clears token and goes to `/login`.
7. **Do not** implement real route guards beyond redirecting to login when token missing on dashboard (simple check OK).

### Assumes (from Anto)
- Auth endpoints exist matching SDD paths and JSON shapes. If Anto’s shapes differ slightly, adapt UI **and** note mismatch in `context.md` as NEED for Integration.

### Manual Test
- Register new user → login → see dashboard stub → logout.

---

## Phase 2 — Dev B (Anto) — Auth API + Prisma User

### Allowed Paths
- `services/api/**`
- `packages/shared/src/**` (add auth DTOs only)
- Prisma schema/migrations

### Tasks
1. Prisma models: `User` (id, email unique, passwordHash, name, createdAt), `Workspace` (id, userId unique, createdAt).
2. On register: create User + Workspace; hash password bcrypt; return user public fields + token.
3. Login: verify password; return JWT including `userId`, `workspaceId`.
4. `GET /auth/me` protected.
5. Middleware `requireAuth`.
6. Export Zod schemas in `packages/shared` for register/login request/response.
7. Seed script optional.

### Manual Test
```bash
curl -X POST localhost:4000/api/v1/auth/register -H 'content-type: application/json' -d '{"email":"a@b.com","password":"password123","name":"Test"}'
curl -X POST localhost:4000/api/v1/auth/login ...
curl localhost:4000/api/v1/auth/me -H "Authorization: Bearer TOKEN"
```

---

## Phase 2 — Dev C (Arvin) — Auth-related shared docs + Postman/HTTP collection

### Allowed Paths
- `docs/api/auth.http` or `docs/api/auth.postman.json`
- `docs/testing/phase-2-auth.md`
- `packages/shared/src/types/auth.ts` **only if Anto did not create it** — prefer not colliding: if unsure, put types under `docs/proposed-auth-types.ts` and merge later

### Tasks
1. Write step-by-step HTTP examples for register/login/me.
2. Write negative cases: duplicate email, bad password, missing token.
3. Document expected error JSON shape.
4. Do **not** change API code.

### Why this phase for Arvin?
Keeps you productive without touching Anto’s auth implementation; produces test kits used in Integration.

---

## Phase 2 — Dev D (Cyrus) — Security checklist + password policy helper (shared util proposal)

### Allowed Paths
- `docs/security/auth-checklist.md`
- `packages/shared/src/validation/password.ts` — **only create if file does not exist**; if Anto owns validation in API already, write proposal under `docs/security/password-rules.md` instead

### Tasks
1. Document password rules: min 8 chars (enforce in doc; Anto implements).
2. Document JWT secret requirements.
3. Document that tokens must not be logged.
4. Write a tiny pure function proposal for password strength check (code in docs or shared if free).

---

## PHASE 2 — Integration Mini-Phase

**Lead:** Brendan  
**Merge order:** Anto → Arvin → Cyrus → Brendan

### Verify
- [ ] Register/login/me works via curl
- [ ] Web forms work against API
- [ ] Shared Zod schemas used by API (and preferably web)
- [ ] Duplicate email returns clear error
- [ ] `context.md` updated

---

# PHASE 3 — Asset Management

**Goal:** Authenticated user can upload, list, tag, soft-delete assets; UI library works.  
**Integration Lead:** Arvin

## Phase 3 — Dev A (Brendan) — Asset Library UI

### Allowed Paths
- `apps/web/app/assets/**`
- `apps/web/components/assets/**`
- `apps/web/lib/api.ts` (extend with asset methods)

### Tasks
1. Upload widget (multipart) for video/image/audio/document.
2. Asset grid with name, type badge, created date, tags.
3. Filter by type; search by name.
4. Detail drawer/modal: edit tags/description; delete button.
5. Polling not required.
6. Empty state when no assets.

### Manual Test
Upload an image and the dummy mp4 (from Cyrus’s script output path); see them listed; tag; delete; confirm gone from list.

---

## Phase 3 — Dev B (Anto) — Assets API + Storage Adapter

### Allowed Paths
- `services/api/src/modules/assets/**`
- Prisma `Asset` model
- `services/api/src/storage/**` (local filesystem adapter)
- `packages/shared` asset DTOs

### Tasks
1. Models: Asset fields per SDD (workspaceId, type, name, path, mime, size, tags[], description, deletedAt, metadata JSON).
2. Endpoints per SDD 5.2.
3. Save files under `storage/workspaces/{workspaceId}/originals/...`.
4. Soft delete sets `deletedAt`.
5. Authorization: only own workspace.
6. Basic MIME allowlist.

### Manual Test
Use curl multipart upload + list + patch + delete.

---

## Phase 3 — Dev C (Arvin) — Asset metadata enrichment worker stub + types

### Allowed Paths
- `services/worker/src/jobs/extractMetadata.ts` (stub OK)
- `packages/shared/src/types/assetMetadata.ts`
- `docs/assets/metadata.md`

### Tasks
1. Define TypeScript type for video metadata: durationMs, width, height, codec.
2. Implement worker function that **can** call ffprobe later; for now, accept a file path and return mock metadata if ffprobe fails.
3. Document how API will enqueue `EXTRACT_METADATA` in a future phase (or this integration if Anto wires it).
4. Do not modify API routes unless Integration asks.

---

## Phase 3 — Dev D (Cyrus) — Thumbnail generation script + API helper notes

### Allowed Paths
- `scripts/media/generate-thumb.sh`
- `services/worker/src/media/thumbnail.ts`
- `docs/ffmpeg-notes.md` (append)

### Tasks
1. Implement `thumbnail.ts`: given input video path + output jpeg path, run ffmpeg mid-frame capture.
2. Shell script wrapper for manual use.
3. Document expected derivative path convention from SDD.
4. Unit-smoke: run on dummy.mp4.

---

## PHASE 3 — Integration Mini-Phase

**Lead:** Arvin  
**Merge order:** Anto → Arvin → Cyrus → Brendan

### Extra wiring during Integration (together)
- Optionally: after upload of video, enqueue metadata + thumbnail jobs **or** call sync for MVP.
- Record decision in `context.md`.

### Verify
- [ ] Upload from UI works
- [ ] List/filter/tag/delete works
- [ ] Video gets thumb or placeholder
- [ ] Files land in `storage/...`

---

# PHASE 4 — Projects & Content Workflow

**Goal:** Projects with stages; attach assets; workflow board.  
**Integration Lead:** Cyrus

## Phase 4 — Dev A (Brendan) — Projects UI + Kanban

### Allowed Paths
- `apps/web/app/projects/**`
- `apps/web/app/workflow/**`
- `apps/web/components/projects/**`
- `apps/web/components/workflow/**`

### Tasks
1. Project list + create form (title, description, target platforms multi-select).
2. Project detail Overview tab: show stage, move-stage dropdown/buttons.
3. Attach existing assets to project (multi-select from library).
4. Kanban board `/workflow` columns = stages from enum; cards show title; drag optional — buttons to move OK for MVP.
5. Use enums from shared package if available; else duplicate temporary constants and mark `TODO_SHARED`.

---

## Phase 4 — Dev B (Anto) — Projects API + Stage Events

### Allowed Paths
- `services/api/src/modules/projects/**`
- Prisma Project, ProjectAsset, StageEvent
- `packages/shared` project DTOs + `ProjectStage` enum

### Tasks
1. Implement SDD project endpoints.
2. Validate stage transitions lightly (allow any forward/back for MVP but record history).
3. Attach/detach assets.
4. List projects filter by stage.

---

## Phase 4 — Dev C (Arvin) — Workflow analytics helpers (pure functions)

### Allowed Paths
- `packages/shared/src/workflow/**`
- `docs/workflow/stages.md`

### Tasks
1. Implement pure helpers: `stageIndex`, `isTerminalStage`, `defaultStageOrder`.
2. Document meaning of each stage for UI copy.
3. Add zod enum for stages matching Anto’s Prisma enum **names** — coordinate via matching SDD names exactly (`IDEA`, `SCRIPT`, ...).

---

## Phase 4 — Dev D (Cyrus) — Project seed script + sample project fixtures

### Allowed Paths
- `scripts/seed/sample-project.ts` (or `.mjs`)
- `samples/projects/demo-project.json`
- `docs/demo/golden-path-prep.md` (start this doc)

### Tasks
1. JSON fixture describing a demo project title + platforms + which sample script to use.
2. Seed script outline that will later create DB rows (may be incomplete until Integration wires auth token).
3. Start golden path prep doc listing stages the demo will walk.

---

## PHASE 4 — Integration Mini-Phase

**Lead:** Cyrus  

### Verify
- [ ] Create project from UI
- [ ] Attach asset
- [ ] Move stages; history endpoint returns events
- [ ] Kanban shows projects by stage

---

# PHASE 5 — AI Script & Hook Generation

**Goal:** Generate scripts/hooks/supporting content; save versions; script UI.  
**Integration Lead:** Anto

## Phase 5 — Dev A (Brendan) — Script Tab UI

### Allowed Paths
- `apps/web` project Script tab components only:
  - `apps/web/components/scripts/**`
  - `apps/web/app/projects/[id]/**` only files needed to add Script tab
  - `apps/web/lib/api.ts` script methods

### Tasks
1. Form: topic, audience, tone, platform → Generate.
2. Show job status while generating (poll `/jobs/:id`).
3. Display structured script (hook/body/CTA).
4. Buttons: Refine (send instruction), Generate Hooks, Generate Supporting Content.
5. Editable textarea to save manual edits as new version.
6. List versions.

---

## Phase 5 — Dev B (Anto) — Scripts API + Jobs table wiring

### Allowed Paths
- `services/api/src/modules/scripts/**`
- `services/api/src/modules/jobs/**`
- Prisma ScriptDocument, ScriptVersion, Job
- Queue producer (BullMQ or DB queue)

### Tasks
1. CRUD scripts + versions.
2. `POST .../scripts/generate` creates Job `GENERATE_SCRIPT` and returns `jobId`.
3. Job status endpoints.
4. On worker completion webhook/internal update — define `PATCH` internal or worker writes DB directly (document choice).
5. Shared DTOs for script structure.

**Important:** If worker update path unclear, write job row and a **mock complete** admin endpoint for UI testing; Integration connects real worker.

---

## Phase 5 — Dev C (Arvin) — `packages/ai-provider` real+mock + worker consumer

### Allowed Paths
- `packages/ai-provider/**`
- `services/worker/src/ai/**`
- `services/worker/src/consumers/generateScript.ts`

### Tasks
1. Implement `AiProvider` interface methods for script, hooks, supporting (from SDD).
2. `MockAiProvider` returns deterministic content from topic string.
3. Real provider behind env `AI_PROVIDER=mock|openai|gemini`.
4. Worker consumer: load job → call provider → write ScriptVersion via DB or API → mark job SUCCEEDED.
5. README for setting API keys.
6. **Never commit API keys.**

---

## Phase 5 — Dev D (Cyrus) — Prompt templates + output schema validation

### Allowed Paths
- `packages/ai-provider/src/prompts/**` — **only if Arvin agrees via context NEED**; otherwise:
- `docs/ai/prompts/**`
- `packages/shared/src/schemas/scriptSchema.ts`

### Tasks
1. Write prompt templates for script, hooks, supporting content (markdown files).
2. Zod schema for `GeneratedScript` shape used by API/UI.
3. Examples of good/bad outputs in docs.

**Collision avoidance:** Prefer `docs/ai/prompts` + `packages/shared` schemas so Arvin owns `packages/ai-provider` code.

---

## PHASE 5 — Integration Mini-Phase

**Lead:** Anto  

### Verify
- [ ] Mock provider generates script end-to-end from UI without API key
- [ ] With key (optional), real provider works
- [ ] Versions saved
- [ ] Hooks + supporting content endpoints work

---

# PHASE 6 — Script-to-Video Understanding

**Goal:** Transcribe footage; align script to timestamps; UI mapping editor.  
**Integration Lead:** Brendan

## Phase 6 — Dev A (Brendan) — Mapping UI

### Allowed Paths
- `apps/web/components/mapping/**`
- Project “Footage & Mapping” tab files
- `apps/web/lib/api.ts` mapping methods

### Tasks
1. Button: Transcribe selected footage asset.
2. Show transcript segments list (click seeks preview if player exists; else show times).
3. Button: Align script.
4. Table: script section | start | end | confidence | edit controls.
5. Manual correction form saving PATCH mapping.
6. Low confidence highlighted.

---

## Phase 6 — Dev B (Anto) — Transcript & Mapping API

### Allowed Paths
- `services/api/src/modules/mapping/**`
- Prisma Transcript, TranscriptSegment, ScriptFootageMap
- Job types TRANSCRIBE, ALIGN_SCRIPT

### Tasks
1. Endpoints per SDD 5.5.
2. Persist transcripts/mappings.
3. Authorization checks.
4. Expose GET for UI.

---

## Phase 6 — Dev C (Arvin) — STT + Alignment algorithms

### Allowed Paths
- `packages/ai-provider` STT + align methods
- `services/worker/src/ai/transcribe.ts`
- `services/worker/src/ai/align.ts`
- `services/worker/src/consumers/transcribe.ts`
- `services/worker/src/consumers/align.ts`

### Tasks
1. Transcription via Whisper API or local; Mock returns timestamped segments from sample script words.
2. Alignment implementation (fuzzy match MVP).
3. Confidence scores 0–1.
4. Tests with sample script text fixtures in `packages/ai-provider/test/fixtures/**`.

---

## Phase 6 — Dev D (Cyrus) — Media prep for transcription + audio extract

### Allowed Paths
- `services/worker/src/media/extractAudio.ts`
- `scripts/media/extract-audio.sh`
- `docs/ffmpeg-notes.md` (append)

### Tasks
1. FFmpeg extract wav/mp3 from video for STT input.
2. Document sample rate recommendations.
3. Ensure paths integrate with storage conventions.
4. Smoke test on dummy.mp4.

---

## PHASE 6 — Integration Mini-Phase

**Lead:** Brendan  

### Verify
- [ ] Transcribe job succeeds on dummy/sample media (mock OK)
- [ ] Align produces mappings
- [ ] UI edit mapping persists
- [ ] Low confidence visible

---

# PHASE 7 — Automated Clip Generation

**Goal:** Propose clip candidates; accept/tweak; render MP4 clip assets.  
**Integration Lead:** Arvin

## Phase 7 — Dev A (Brendan) — Clips Tab UI

### Allowed Paths
- `apps/web/components/clips/**`
- Project Clips tab
- API client methods

### Tasks
1. Propose clips button → poll job.
2. List candidates: title, start/end, score, status.
3. Edit start/end; Accept/Reject.
4. Render button; show resulting asset link/preview.
5. Batch accept optional.

---

## Phase 7 — Dev B (Anto) — Clips API

### Allowed Paths
- `services/api/src/modules/clips/**`
- Prisma ClipCandidate
- Job types SCORE_CLIPS, RENDER_CLIP

### Tasks
1. Endpoints per SDD 5.6.
2. When render succeeds, create Asset linked to candidate.
3. Status field: proposed/accepted/rejected/rendered.

---

## Phase 7 — Dev C (Arvin) — Clip scoring AI

### Allowed Paths
- `packages/ai-provider` scoreClipWindows
- `services/worker/src/consumers/scoreClips.ts`
- fixtures/tests

### Tasks
1. Rank windows 15–60s using transcript + script cues.
2. Mock scorer returns 3 stable candidates for demo.
3. Output title suggestions + confidence.

---

## Phase 7 — Dev D (Cyrus) — FFmpeg clip cutter

### Allowed Paths
- `services/worker/src/media/cutClip.ts`
- `services/worker/src/consumers/renderClip.ts`
- `scripts/media/cut-clip.sh`

### Tasks
1. Cut precise start/end to MP4 in storage renders path.
2. Prefer re-encode for accuracy if copy keyframes drift (document choice).
3. Return output path to job output JSON.
4. Smoke test cutting dummy.mp4 into 2s clip.

---

## PHASE 7 — Integration Mini-Phase

**Lead:** Arvin  

### Verify
- [ ] Propose → accept → render → new asset in library
- [ ] UI shows clip preview
- [ ] Candidate tweak changes render boundaries

---

# PHASE 8 — AI-Assisted Editable Editing

**Goal:** Timeline JSON schema package; generate/propose timeline; editor UI; re-render preview.  
**Integration Lead:** Cyrus

## Phase 8 — Dev A (Brendan) — Timeline Editor UI

### Allowed Paths
- `apps/web/app/projects/[id]/editor/**`
- `apps/web/components/editor/**`
- editor state store file under `apps/web`

### Tasks
1. Layout: bin | preview | tracks | inspector.
2. Load timeline JSON into editable UI.
3. Edit text overlay; trim clip; reorder.
4. Save timeline (PUT).
5. AI Suggest panel: show proposal; Apply creates local draft then save; Dismiss cancels.
6. Render preview button + show job status + video player for output.

---

## Phase 8 — Dev B (Anto) — Timelines API + versioning

### Allowed Paths
- `services/api/src/modules/timelines/**`
- Prisma EditTimeline, TimelineVersion
- Job RENDER_TIMELINE, GENERATE_TIMELINE

### Tasks
1. Endpoints per SDD 5.7.
2. Each PUT creates new TimelineVersion.
3. Generate endpoint enqueues AI proposal job; result stored as **proposal** version flagged `source=ai_proposal` until applied (or store parallel field). Document apply semantics in context.
4. Never overwrite user version silently.

---

## Phase 8 — Dev C (Arvin) — Timeline proposal AI

### Allowed Paths
- `packages/ai-provider` proposeTimeline
- `services/worker/src/consumers/generateTimeline.ts`
- tests producing valid timeline JSON

### Tasks
1. Build timeline JSON from mappings + accepted clips + hook text overlay at 0–3s.
2. Validate against schema package (Cyrus).
3. Mock returns fixed valid timeline for demo.

---

## Phase 8 — Dev D (Cyrus) — `packages/timeline-schema` + FFmpeg timeline renderer

### Allowed Paths
- `packages/timeline-schema/**`
- `services/worker/src/media/renderTimeline.ts`
- `services/worker/src/consumers/renderTimeline.ts`
- `docs/timeline-notes.md` (update to FINAL)

### Tasks
1. Implement zod/JSON schema `schemaVersion: 1.0` per SDD.
2. Export TypeScript types + `assertValidTimeline`.
3. Implement renderer translating timeline → ffmpeg plan → output mp4.
4. Support video cuts + text drawtext overlays + captions softsubs if possible; text overlays minimum required.
5. Tests: valid/invalid timeline fixtures.

---

## PHASE 8 — Integration Mini-Phase

**Lead:** Cyrus  

### Verify
- [ ] AI propose → Apply → edit text → save → render preview plays
- [ ] Timeline versions list grows
- [ ] Invalid timeline rejected by API validation

---

# PHASE 9 — Multi-Platform Adaptation

**Goal:** Generate platform packs (aspect ratios + copy); track publish status; download.  
**Integration Lead:** Anto

## Phase 9 — Dev A (Brendan) — Platform Packs UI

### Allowed Paths
- `apps/web/components/packs/**`
- Project Platform Packs tab

### Tasks
1. Select platforms; generate packs.
2. Show each pack: aspect, title/caption/hashtags editable, status select, download links.
3. Mark Ready / Published.

---

## Phase 9 — Dev B (Anto) — Packs API

### Allowed Paths
- `services/api/src/modules/packs/**`
- Prisma PlatformPack
- Job ADAPT_PLATFORM

### Tasks
1. Endpoints per SDD 5.8.
2. Store copy fields + output asset IDs + status.
3. Download endpoint returns URLs or zip if feasible (URLs OK for MVP).

---

## Phase 9 — Dev C (Arvin) — Platform copy generation

### Allowed Paths
- `packages/ai-provider` supporting content per platform nuances
- worker consumer pieces for copy generation
- `docs/ai/platform-copy-guidelines.md`

### Tasks
1. Generate title/caption/hashtags tuned per platform (length limits).
2. Mock provider returns distinct strings per platform for demo clarity.
3. Document char limits.

---

## Phase 9 — Dev D (Cyrus) — Aspect ratio adaptation FFmpeg

### Allowed Paths
- `services/worker/src/media/adaptAspect.ts`
- `services/worker/src/consumers/adaptPlatform.ts`
- scripts + docs

### Tasks
1. Convert source preview/clip to 16:9, 9:16, 1:1 via crop/pad.
2. Center crop MVP; optional face-aware skipped unless easy.
3. Emit assets into storage; return paths.
4. Smoke tests for each ratio on dummy media.

---

## PHASE 9 — Integration Mini-Phase

**Lead:** Anto  

### Verify
- [ ] Generate packs for ≥2 platforms
- [ ] Different aspect outputs exist
- [ ] Status updates persist
- [ ] Download/open works

---

# PHASE 10 — Creator Intelligence + Demo Polish

**Goal:** Insights dashboard; job center polish; golden path works; README demo script.  
**Integration Lead:** Brendan

## Phase 10 — Dev A (Brendan) — Insights UI + Dashboard polish

### Allowed Paths
- `apps/web/app/insights/**`
- `apps/web/app/page.tsx` (dashboard)
- `apps/web/app/jobs/**`
- UX polish CSS only within `apps/web`

### Tasks
1. Dashboard cards: counts of projects, assets, clips, jobs running.
2. Insights page: charts/tables (simple bars OK) for stage distribution, clips per project, platform mix.
3. Manual engagement form (views/likes) optional field submit.
4. Job center: list + retry button.
5. Fix obvious empty states / loading spinners on main golden path pages.

---

## Phase 10 — Dev B (Anto) — Insights API + retry job + health polish

### Allowed Paths
- `services/api/src/modules/insights/**`
- jobs retry endpoint
- aggregations queries

### Tasks
1. `GET /insights/overview` metrics from DB.
2. `POST /insights/engagement` store manual metrics.
3. `POST /jobs/:id/retry` requeues failed jobs.
4. Ensure indexes if needed for counts.
5. Harden error messages.

---

## Phase 10 — Dev C (Arvin) — Demo AI reliability + seed content

### Allowed Paths
- `packages/ai-provider` mock improvements
- `samples/**`
- `scripts/demo/**`
- `docs/demo/judge-script.md`

### Tasks
1. Make MockAiProvider demo-stable (no randomness without seed).
2. Write judge demo script: click-by-click golden path (SRS Section 8).
3. Demo seed script that creates user/project/assets references if possible.
4. Fallback switches documented when offline.

---

## Phase 10 — Dev D (Cyrus) — Media pipeline hardening + performance notes

### Allowed Paths
- `services/worker/src/media/**`
- `docs/demo/media-checklist.md`
- `scripts/media/**`

### Tasks
1. Fix edge failures (missing files, zero-duration).
2. Add clear error strings to job failures.
3. Pre-bake a sample rendered clip for emergency demo fallback (instructions, not huge binaries if avoidable).
4. Final media checklist for judges’ machine (ffmpeg required, etc.).

---

## PHASE 10 — Integration Mini-Phase (Final)

**Lead:** Brendan  

### Final Verification — Golden Path Gate (from SRS §8)
- [ ] Sign up / log in
- [ ] Create project + platforms
- [ ] Upload/generate script + upload footage
- [ ] Transcribe + map + correct one mapping
- [ ] Propose clips; accept one; render
- [ ] Generate timeline; edit one overlay; re-render
- [ ] Generate ≥2 platform packs
- [ ] Move stages to Ready/Published
- [ ] Insights show metrics
- [ ] Root README can bring up system cold

### Release
1. Merge to `main`.
2. Tag `v0.1.0-mvp` and `phase-10-done`.
3. Final `context.md` INTEGRATION entry: “MVP COMPLETE”.

---

## Appendix A — Conflict Avoidance Matrix

| Area | Owner most phases | Others must not edit mid-phase |
|------|-------------------|--------------------------------|
| `apps/web` | Brendan | Others: docs only |
| `services/api` | Anto | Others: only worker/api contracts via shared |
| `packages/ai-provider` + AI worker consumers | Arvin | Others: prompts in docs |
| `packages/timeline-schema` + FFmpeg media | Cyrus | Others: call APIs only |
| `packages/shared` | Anto primary; others add only when phase allows | If not allowed: put proposal in `docs/proposed-shared/` |

---

## Appendix B — Environment Variables (Final Target)

```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://...          # optional
JWT_SECRET=change-me
PORT=4000
STORAGE_ROOT=./storage
AI_PROVIDER=mock
OPENAI_API_KEY=                # optional
GEMINI_API_KEY=                # optional
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

---

## Appendix C — What “Independent” Means in Practice

During a phase, Brendan can fully build a UI against **documented** API shapes even if Anto’s branch is not merged yet, by:
1. Reading SDD API tables.
2. Using MSW/mock fixtures in web **only if local** to `apps/web` — delete mocks if Integration connects real API, or keep behind flag.

Arvin can implement providers with unit tests without API running.

Cyrus can run ffmpeg scripts on dummy media without UI.

Anto can craft APIs returning fake job completion for UI until worker merges.

**Integration is where wires connect.** Each phase’s Integration checklist explicitly lists the wires.

---

## Appendix D — Emergency Protocol

If a developer is absent mid-phase:
1. Integration Lead reassigns only **unfinished P0** tasks.
2. Note reassignment in `context.md` TYPE=DECISION.
3. Do not silently rewrite completed modules.

If merge conflict threatens demo:
1. Prefer Mock AI + pre-rendered sample outputs.
2. Keep editable timeline JSON even if render fails (show JSON + message).

---

## Appendix E — Phase Completion Template (paste into context.md)

```md
## Phase <N> Completion — <Name>
- Branch: phase-0N-<name>
- All allowed tasks done: yes/no
- Incomplete items: ...
- Blockers handed to Integration: ...
- Commands to verify my work: ...
- Files I expect others to connect to: ...
```

---

**End of Development Plan**

Everyone: when in doubt, follow Allowed Paths, write a NEED in `context.md`, and wait for the Integration Mini-Phase. Do not “just quickly edit” someone else’s folder.
