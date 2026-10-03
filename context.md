# CreatorAi — Shared Context Log (`context.md`)

> **Purpose:** This file is the team’s shared brain. Because developers do **not** talk to each other during a phase, everything important must be written here so the next person (and Integration) can understand what exists, what changed, what is blocked, and how to run things.
>
> **Rule:** Append only. Never delete old entries. Never rewrite history. You may add a later entry that corrects an earlier one.
>
> **Rule:** Update this file with **every single thing you do** — even “created empty folder” or “tried X and it failed.”
>
> **Companion docs:** `SRS.md` (what), `SDD.md` (how), `DEVELOPMENT_PLAN.md` (who/when).

---

## 1. Quick Start for Any Developer (read every time you sit down)

1. `git checkout main && git pull`
2. Read **Section 2 (Current Snapshot)** below.
3. Read the **latest 20 entries** in Section 5 (Chronological Log).
4. Read your tasks for the current phase in `DEVELOPMENT_PLAN.md`.
5. Create/switch to your branch: `phase-<NN>-<yourname>`.
6. Do work → **append a log entry after every meaningful action**.
7. At phase end, paste a Phase Completion block (template in Section 6).

---

## 2. Current Snapshot (UPDATE MANUALLY at every Integration)

> Integration Lead must refresh this entire section at the end of each Integration Mini-Phase.

| Field | Value |
|-------|-------|
| **Current phase** | Phase 1 complete — Phase 2 next |
| **Last completed tag** | `phase-1-done` (pending push) |
| **main status** | Monorepo foundation: `apps/web`, `services/api`, `services/worker`, `packages/shared`, media scripts, samples |
| **Package manager** | **pnpm** workspaces (final) |
| **Queue decision** | **DB-polling queue for MVP**; Redis remains optional in compose (`--profile redis`) for later BullMQ |
| **Default AI provider** | `mock` until keys available |
| **API base URL (local)** | `http://localhost:4000/api/v1` |
| **Web app (local)** | `http://localhost:3000` |
| **Who is Integration Lead next** | Brendan (after Phase 2) |

### 2.1 What Already Works
- `pnpm install` at root (workspace: web, api, worker, shared)
- `GET /api/v1/health` → `{ status: 'ok', service: 'api' }`
- `pnpm --filter web dev` (Next.js shell + nav stubs)
- `pnpm --filter worker dev` → `worker skeleton started`
- `./scripts/media/check-ffmpeg.sh` / `make-dummy-video.sh`
- Sample script at `samples/scripts/sample_script.md`

### 2.2 Known Broken / Gaps
- Host `:5432` may already be occupied; use Podman/Docker mapped to `5433` and set `DATABASE_URL` accordingly (see `.env.example` note).
- Arvin’s Phase 1 branch never shipped code; Integration Lead scaffolded worker + `docs/ai-contracts.md` + samples during mini-phase.
- No auth / domain models yet (Phase 2).

### 2.3 Active Blockers
- None.

### 2.4 Open NEED Items (from developers)
- None open for Phase 1.

### 2.5 Important Paths That Exist
```
/
├── apps/web/
├── services/api/
├── services/worker/
├── packages/shared/
├── samples/scripts/sample_script.md
├── scripts/media/
├── storage/.gitkeep
├── docs/ffmpeg-notes.md
├── docs/timeline-notes.md
├── docs/ai-contracts.md
├── docker-compose.yml
├── pnpm-workspace.yaml
├── .env.example
├── README.md
├── SRS.md
├── SDD.md
├── DEVELOPMENT_PLAN.md
└── context.md
```

### 2.6 Env Vars In Use
Root `.env.example`: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `STORAGE_ROOT`. Optional `REDIS_URL`. Web: `NEXT_PUBLIC_API_BASE_URL`.

---

## 3. Team Roster & Default Ownership

| Code | Name | Default ownership |
|------|------|-------------------|
| Dev A | Brendan Rodrigues | Frontend (`apps/web`) |
| Dev B | Anto Oswald | API + DB + `packages/shared` |
| Dev C | Arvin Almeida | AI provider + AI workers + samples/docs for AI |
| Dev D | Cyrus Selvaraj | FFmpeg/media workers + timeline schema + media scripts |

**Merge order every Integration:** Anto → Arvin → Cyrus → Brendan

---

## 4. How to Write Entries (mandatory format)

Copy-paste this template every time:

```md
### [YYYY-MM-DD HH:MM] ROLE=<A|B|C|D> NAME=<Full Name> PHASE=<N or 0> TYPE=<START|PROGRESS|DONE|NEED|BLOCKER|DECISION|INTEGRATION|FIX>
- **Summary:** 
- **Files touched:** 
- **APIs / types added:** 
- **How to run / test what I did:** 
- **Depends on:** 
- **Needs from others:** 
- **Risks:** 
```

### TYPE meanings
| TYPE | Use when |
|------|----------|
| START | You began a phase or major task |
| PROGRESS | Mid-work update (preferred often) |
| DONE | Finished your phase tasks (also use Phase Completion block) |
| NEED | You need a file/API/decision from someone else |
| BLOCKER | You cannot continue |
| DECISION | A choice was made (usually during Integration) |
| INTEGRATION | Integration Mini-Phase notes |
| FIX | Hotfix after merge |

---

## 5. Chronological Log (append below; newest at bottom)

### [2026-10-03 16:30] ROLE=TEAM NAME=GuguGaga PHASE=0 TYPE=DECISION
- **Summary:** Created baseline planning documents for CreatorAi from the Bit n Build problem statement.
- **Files touched:** `SRS.md`, `SDD.md`, `DEVELOPMENT_PLAN.md`, `context.md`
- **APIs / types added:** None in code yet; API shapes documented in `SDD.md`.
- **How to run / test what I did:** Open and read the four docs; no runtime.
- **Depends on:** Problem statement requirements (asset mgmt, AI scripts/hooks, script-to-video, clips, editable AI edits, multi-platform, workflow, intelligence).
- **Needs from others:** All four developers must read all docs before Phase 1 starts.
- **Risks:** Tech choices (pnpm/Redis) still to confirm in Phase 1 Integration.

### [2026-10-03 16:30] ROLE=TEAM NAME=GuguGaga PHASE=0 TYPE=PROGRESS
- **Summary:** Document responsibilities locked for Phase 1 kickoff.
- **Files touched:** `DEVELOPMENT_PLAN.md` (Phase 1 sections)
- **APIs / types added:** Planned `GET /api/v1/health` for Phase 1.
- **How to run / test what I did:** N/A
- **Depends on:** Node 20+, FFmpeg installed on each machine, Docker recommended.
- **Needs from others:**
  - Brendan: prepare for Next.js shell in Phase 1
  - Anto: prepare for monorepo + API stub + Postgres compose
  - Arvin: prepare sample script + worker skeleton
  - Cyrus: prepare ffmpeg check + dummy video scripts
- **Risks:** If FFmpeg missing on a laptop, Cyrus’s Phase 1 tests fail — install early.

### [2026-10-03 11:48] ROLE=D NAME=Cyrus Selvaraj PHASE=1 TYPE=START
- **Summary:** Started Phase 1 Dev D on branch `phase-01-cyrus` — storage folder, FFmpeg scripts, timeline notes.
- **Files touched:** (branch created; work in progress)
- **APIs / types added:** None
- **How to run / test what I did:** `git checkout phase-01-cyrus`
- **Depends on:** FFmpeg on PATH (installed via `apt` on this WSL machine for verification)
- **Needs from others:** Anto should gitignore `storage/**` contents (keep `.gitkeep`) in root `.gitignore` during Phase 1
- **Risks:** Dummy MP4 must never be committed

### [2026-10-03 11:50] ROLE=D NAME=Cyrus Selvaraj PHASE=1 TYPE=DONE
- **Summary:** Phase 1 Dev D complete — storage keepfile, FFmpeg check + dummy video scripts, ffmpeg/timeline docs.
- **Files touched:** `storage/.gitkeep`, `scripts/media/check-ffmpeg.sh`, `scripts/media/make-dummy-video.sh`, `docs/ffmpeg-notes.md`, `docs/timeline-notes.md`, `context.md`
- **APIs / types added:** None (timeline JSON documented only; schema package is Phase 8)
- **How to run / test what I did:**
  ```bash
  ./scripts/media/check-ffmpeg.sh
  ./scripts/media/make-dummy-video.sh
  # → storage/samples/dummy.mp4 (~87KB, 5s color bars + sine). Do NOT git add.
  ffprobe -hide_banner storage/samples/dummy.mp4
  ```
- **Depends on:** `ffmpeg` + `ffprobe` on PATH
- **Needs from others:** Integration: `chmod +x scripts/media/*.sh` after merge; Anto ignore `storage/samples/` binaries
- **Risks:** None remaining for Phase 1 D scope

### [2026-10-03 16:57] ROLE=A NAME=Brendan Rodrigues PHASE=1 TYPE=START
- **Summary:** Started Phase 1 Dev A — Frontend Shell Only on branch `phase-01-brendan`.
- **Files touched:** _(none yet)_
- **APIs / types added:** None
- **How to run / test what I did:** N/A
- **Depends on:** Node 20+, pnpm
- **Needs from others:** None to start (workspace wiring is Anto’s later)
- **Risks:** None

### [2026-10-03 17:05] ROLE=A NAME=Brendan Rodrigues PHASE=1 TYPE=DONE
- **Summary:** Scaffolded Next.js App Router + TypeScript + Tailwind in `apps/web` with CreatorAi top nav and stub routes for all Phase 1 pages. Standalone install works via `cd apps/web && pnpm install && pnpm dev`. Did **not** create root `pnpm-workspace.yaml` (Anto’s job).
- **Files touched:** `apps/web/**` (Next app, layout/nav, stub pages, `.env.example`, `README.md`), `context.md`
- **APIs / types added:** None (frontend shell only). Env: `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`
- **How to run / test what I did:**
  ```bash
  cd apps/web && pnpm install && pnpm dev
  # open http://localhost:3000 and click each nav link
  # dynamic stubs: /projects/demo and /projects/demo/editor
  ```
- **Depends on:** Nothing runtime from other devs for this phase
- **Needs from others:** Anto — root `pnpm-workspace.yaml` + root scripts so `pnpm --filter web dev` works from repo root (Integration)
- **Risks:** Until root workspace exists, web must be run from `apps/web` directly

### [2026-10-03 17:05] ROLE=A NAME=Brendan Rodrigues PHASE=1 TYPE=NEED
- **Summary:** Need monorepo workspace wiring so package name `web` is visible from root.
- **Files touched:** None
- **APIs / types added:** None
- **How to run / test what I did:** N/A
- **Depends on:** Anto Phase 1 root `package.json` + `pnpm-workspace.yaml` including `apps/*`
- **Needs from others:** Anto / Integration — include `apps/web` in workspace; optional root script alias for `web`
- **Risks:** Judges/devs trying `pnpm --filter web` from root will fail until Integration merges Anto + Brendan

### [2026-10-03 17:05] ROLE=B NAME=Anto Oswald PHASE=1 TYPE=START
- **Summary:** Started Phase 1 Dev B — monorepo tooling, API stub, Postgres compose, `packages/shared`.
- **Files touched:** (branch `phase-01-anto` created from `main`)
- **APIs / types added:** None yet (starting).
- **How to run / test what I did:** N/A
- **Depends on:** Node 20+, pnpm, Docker/Podman for Postgres.
- **Needs from others:** None to start (workspace will absorb `apps/web` + `services/worker` at Integration).
- **Risks:** This machine has Podman but no `docker` / `podman-compose` plugin; compose file still provided for Docker Desktop users.

### [2026-10-03 17:10] ROLE=B NAME=Anto Oswald PHASE=1 TYPE=PROGRESS
- **Summary:** Created root workspace, `.gitignore`, `.env.example`, `docker-compose.yml` (Postgres + optional Redis profile), `packages/shared`, Fastify API with health route, empty Prisma schema.
- **Files touched:** `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`, `docker-compose.yml`, `README.md`, `packages/shared/**`, `services/api/**`, `pnpm-lock.yaml`
- **APIs / types added:**
  - `GET /api/v1/health` → `{ status: 'ok', service: 'api' }`
  - Shared types: `HealthResponse`, `ApiError`; constant `API_PREFIX = '/api/v1'`
- **How to run / test what I did:**
  ```bash
  cp .env.example .env
  pnpm install
  pnpm --filter @creatorai/shared build   # also runs via prepare on install
  pnpm --filter api prisma:validate
  docker compose up -d                    # Postgres :5432
  pnpm --filter api dev
  curl http://localhost:4000/api/v1/health
  ```
- **Depends on:** Root `.env` (API + Prisma scripts load `../../.env` via dotenv).
- **Needs from others:** Brendan/Arvin packages land under `apps/*` / `services/*` (workspace globs already include them).
- **Risks:** Local host already had something on `:5432`; Podman Postgres container could not bind. Compose file is correct for a free port / Docker users. Redis is under compose profile `redis` (optional until Integration queue decision).

### [2026-10-03 17:12] ROLE=B NAME=Anto Oswald PHASE=1 TYPE=DONE
- **Summary:** Phase 1 Dev B checklist complete — `pnpm install` works, shared builds, API health returns 200, Prisma schema validates, compose file present.
- **Files touched:** Same as PROGRESS + this `context.md` completion block.
- **APIs / types added:** (unchanged) `GET /api/v1/health`
- **How to run / test what I did:** See PROGRESS + Phase Completion block below.
- **Depends on:** None for health stub.
- **Needs from others:** Integration will merge worker + web into workspace.
- **Risks:** Documented in PROGRESS (compose plugin / port 5432 on this laptop).

### [2026-10-03 18:00] ROLE=B NAME=Anto Oswald PHASE=1 TYPE=INTEGRATION
- **Summary:** Phase 1 Integration Lead closed gaps (worker skeleton, ai-contracts, samples, ffmpeg script fix), verified checklist, decided pnpm + DB-polling queue for MVP.
- **Files touched:** `services/worker/**`, `docs/ai-contracts.md`, `samples/**`, `scripts/media/check-ffmpeg.sh`, `package.json`, `README.md`, `.env.example`, `context.md`
- **APIs / types added:** None new (health already present)
- **How to run / test what I did:** See INTEGRATION COMPLETE — Phase 1 in Section 7
- **Depends on:** Merged Phase 1 PRs for Anto/Brendan/Cyrus
- **Needs from others:** None for Phase 1 close
- **Risks:** Local host Postgres may occupy `:5432`; use `:5433` mapping

### [2026-10-03 17:56] ROLE=B NAME=Anto Oswald PHASE=2 TYPE=START
- **Summary:** Started Phase 2 Dev B on `phase-02-anto` — Auth API + Prisma User/Workspace + shared Zod auth DTOs.
- **Files touched:** (branch created from `main` @ `phase-1-done`)
- **APIs / types added:** Planned `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- **How to run / test what I did:** `git checkout phase-02-anto`
- **Depends on:** Phase 1 integration complete; Postgres reachable via `DATABASE_URL`
- **Needs from others:** None to start (Brendan builds UI against these shapes)
- **Risks:** Host `:5432` conflict — this machine uses `:5433`

### [2026-10-03 18:00] ROLE=B NAME=Anto Oswald PHASE=2 TYPE=DONE
- **Summary:** Phase 2 Dev B complete — User/Workspace Prisma models, bcrypt+JWT auth routes, `requireAuth`, shared Zod auth schemas.
- **Files touched:** `services/api/prisma/**`, `services/api/src/**`, `packages/shared/src/auth.ts`, `packages/shared/src/index.ts`, `packages/shared/package.json`, `services/api/package.json`, `README.md`, `context.md`, `pnpm-lock.yaml`
- **APIs / types added:**
  - `POST /api/v1/auth/register` → `{ token, user, workspace }` (201)
  - `POST /api/v1/auth/login` → `{ token, user, workspace }` (200)
  - `GET /api/v1/auth/me` → `{ user, workspace }` (Bearer JWT)
  - Shared: `registerRequestSchema`, `loginRequestSchema`, `authTokenResponseSchema`, `meResponseSchema`, `JwtPayload`
  - JWT claims: `{ userId, workspaceId }` (7d TTL)
  - Password min length: 8
- **How to run / test what I did:**
  ```bash
  pnpm install
  pnpm --filter @creatorai/shared build
  pnpm --filter api prisma:migrate   # or prisma migrate deploy
  pnpm --filter api dev
  curl -X POST localhost:4000/api/v1/auth/register -H 'content-type: application/json' \
    -d '{"email":"a@b.com","password":"password123","name":"Test"}'
  curl -X POST localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
    -d '{"email":"a@b.com","password":"password123"}'
  curl localhost:4000/api/v1/auth/me -H "Authorization: Bearer TOKEN"
  ```
- **Depends on:** Postgres (`DATABASE_URL`); `JWT_SECRET` in `.env`
- **Needs from others:** Brendan — wire Auth UI to these JSON shapes; Arvin — HTTP collection can mirror these paths
- **Risks:** None remaining for Phase 2 B scope

---

## 6. Phase Completion Blocks (paste at end of your phase)

```md
## Phase <N> Completion — <Full Name> (Dev <A|B|C|D>)
- **Date:** 
- **Branch:** phase-<NN>-<name>
- **All allowed tasks done:** yes/no
- **Incomplete items:** 
- **Blockers handed to Integration:** 
- **Commands to verify my work:** 
- **Files I expect others to connect to:** 
- **Notes for next phase me:** 
```

_(Earlier phases: none.)_

## Phase 1 Completion — Cyrus Selvaraj (Dev D)
- **Date:** 2026-10-03
- **Branch:** phase-01-cyrus
- **All allowed tasks done:** yes
- **Incomplete items:** none
- **Blockers handed to Integration:** Ensure root `.gitignore` excludes `storage/samples/**` (and ideally all of `storage/**` except `.gitkeep`); make scripts executable on merge
- **Commands to verify my work:**
  ```bash
  ./scripts/media/check-ffmpeg.sh
  ./scripts/media/make-dummy-video.sh
  ```
- **Files I expect others to connect to:**
  - `storage/` → Anto `STORAGE_ROOT` / assets API (Phase 3)
  - `scripts/media/*` → worker media pipeline (Phases 3, 6–9)
  - `docs/timeline-notes.md` → `packages/timeline-schema` (Phase 8)
  - `docs/ffmpeg-notes.md` → team media setup
- **Notes for next phase me:** Phase 2 is docs/security only; real media code resumes Phase 3 (thumbnails)

## Phase 1 Completion — Anto Oswald (Dev B)
- **Date:** 2026-10-03
- **Branch:** phase-01-anto
- **All allowed tasks done:** yes
- **Incomplete items:** None (local Podman compose plugin missing — not a repo gap; `docker-compose.yml` is committed).
- **Blockers handed to Integration:** Confirm pnpm workspaces after merging web + worker; decide Redis vs DB queue (Redis service already optional in compose under `--profile redis`).
- **Commands to verify my work:**
  ```bash
  cp .env.example .env
  pnpm install
  pnpm --filter @creatorai/shared build
  pnpm --filter api prisma:validate
  docker compose up -d
  pnpm --filter api dev
  curl http://localhost:4000/api/v1/health
  ```
- **Files I expect others to connect to:**
  - `@creatorai/shared` (`HealthResponse`, `ApiError`, `API_PREFIX`)
  - API on port `4000` under `/api/v1`
  - Root workspace globs: `apps/*`, `services/*`, `packages/*`
  - `.env.example` / `DATABASE_URL` for later Prisma models
- **Notes for next phase me:** Phase 2 = Auth API + Prisma User model; keep shared types as source of truth.

_(Template above kept for other developers.)_

## Phase 1 Completion — Brendan Rodrigues (Dev A)
- **Date:** 2026-10-03
- **Branch:** phase-01-brendan
- **All allowed tasks done:** yes
- **Incomplete items:** Root workspace wiring (intentionally left to Anto)
- **Blockers handed to Integration:** Wire `apps/web` into root pnpm workspace; verify `pnpm --filter web dev` from root
- **Commands to verify my work:**
  ```bash
  cd apps/web && pnpm install && pnpm dev
  # click nav: Dashboard, Assets, Projects, Workflow, Jobs, Insights, Login, Register
  # also visit /projects/demo and /projects/demo/editor
  ```
- **Files I expect others to connect to:** `apps/web` package name `web`; `NEXT_PUBLIC_API_BASE_URL` points at Anto’s API
- **Notes for next phase me:** Phase 2 is Auth UI — build against documented `/auth/login` and `/auth/register` shapes even before API merge

## Phase 2 Completion — Anto Oswald (Dev B)
- **Date:** 2026-10-03
- **Branch:** phase-02-anto
- **All allowed tasks done:** yes
- **Incomplete items:** none (logout is client-side discard per MVP; no blacklist)
- **Blockers handed to Integration:** Brendan must match `AuthTokenResponse` / `MeResponse` shapes; run `prisma migrate` before testing
- **Commands to verify my work:**
  ```bash
  pnpm --filter api prisma:migrate
  pnpm --filter api dev
  curl -X POST localhost:4000/api/v1/auth/register -H 'content-type: application/json' -d '{"email":"a@b.com","password":"password123","name":"Test"}'
  curl -X POST localhost:4000/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"a@b.com","password":"password123"}'
  curl localhost:4000/api/v1/auth/me -H "Authorization: Bearer TOKEN"
  ```
- **Files I expect others to connect to:**
  - `@creatorai/shared` auth Zod schemas + types
  - `services/api/src/auth/jwt.ts` (`requireAuth`)
  - `POST/GET /api/v1/auth/*`
- **Notes for next phase me:** Phase 3 = Assets API + storage adapter; reuse `request.auth.workspaceId`

---

## 7. Integration Records (paste after each Integration Mini-Phase)

```md
## INTEGRATION COMPLETE — Phase <N>
- **Date:** 
- **Lead:** 
- **Branches merged (in order):** 
- **Conflicts & resolutions:** 
- **Verification checklist results:** 
- **Decisions made:** 
- **Updated Current Snapshot:** yes/no (must be yes)
- **Tag pushed:** phase-<N>-done
- **Follow-ups for Phase <N+1>:** 
```

## INTEGRATION COMPLETE — Phase 1
- **Date:** 2026-10-03
- **Lead:** Anto Oswald
- **Branches merged (in order):** Anto (`phase-01-anto` via PR #1) → Brendan (`Brendan` via PR #2) → Cyrus (`phase-01-cyrus` via PR #3). Arvin (`origin/Arvin`) had **no Phase 1 code** (docs-only); Integration Lead filled P0 gaps.
- **Conflicts & resolutions:** No content conflicts on PR merges. Integration fixes on `phase-01-integration`:
  - Scaffolded `services/worker` (package + `src/index.ts` + README)
  - Added `docs/ai-contracts.md` and tracked `samples/**`
  - `chmod +x` on media scripts; fixed `check-ffmpeg.sh` SIGPIPE/`pipefail` exit 141 with `head`
  - Root scripts: `dev:web`, `dev:worker`
- **Verification checklist results:**
  - [x] `pnpm install` at root succeeds (5 projects: web, api, worker, shared, root)
  - [x] `curl` health OK → `{"status":"ok","service":"api"}`
  - [x] `pnpm --filter web` resolves (package `web`)
  - [x] `pnpm --filter worker dev` prints `worker skeleton started`
  - [x] `scripts/media/check-ffmpeg.sh` OK
  - [x] Decisions recorded below
- **Decisions made:**
  - Package manager: **pnpm** (final)
  - Queue for MVP: **DB-polling** (Redis optional via compose profile for later BullMQ)
- **Updated Current Snapshot:** yes
- **Tag pushed:** `phase-1-done` (local; push when ready)
- **Follow-ups for Phase 2:** Auth (Anto API + Brendan UI); Arvin docs/http collection; Cyrus security docs. Ensure Postgres reachable (if host `:5432` busy, map container to `5433`).

---

## 8. Interface Contract Scratchpad

> Use this when you temporarily invent a shape that is not yet in `packages/shared`. During Integration, move winners into shared code and note it here.

| Date | Author | Contract name | Temporary location | Final home (after Integration) | Status |
|------|--------|---------------|--------------------|--------------------------------|--------|
| — | — | — | — | — | — |

---

## 9. Demo Notes (fill as you go)

| Item | Status | Notes |
|------|--------|-------|
| Sample script | Done Phase 1 | `samples/scripts/sample_script.md` |
| Dummy video | Done Phase 1 (Cyrus) | generate via script, don’t commit huge binaries |
| Mock AI stable | Planned Phase 5/10 (Arvin) | |
| Golden path judge script | Planned Phase 10 (Arvin) | `docs/demo/judge-script.md` |
| Emergency pre-rendered clip | Planned Phase 10 (Cyrus) | |

---

## 10. Glossary (living)

| Term | Meaning |
|------|---------|
| Phase | Parallel work period; no cross-dev coding contact |
| Integration Mini-Phase | Merge + wire + verify after a phase |
| Timeline JSON | Editable edit decision document (not only MP4) |
| Platform Pack | Per-platform outputs (video ratio + copy + status) |
| MockAiProvider | Offline/demo AI that needs no API key |

---

**Remember:** If it is not in `context.md`, the rest of the team does not know it exists.
