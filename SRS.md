# Software Requirements Specification (SRS)
## CreatorAi — AI-Powered Creator Operating Platform

| Field | Value |
|-------|-------|
| **Document Version** | 1.0 |
| **Project** | CreatorAi |
| **Team** | GuguGaga (Brendan Rodrigues, Anto Oswald, Arvin Almeida, Cyrus Selvaraj) |
| **Event** | Bit n Build — Maharashtra State Round |
| **Status** | Approved for development |

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) defines the functional and non-functional requirements for **CreatorAi**, an AI-powered content operations platform that unifies the creator workflow from idea and script to recording, editing, repurposing, and publishing.

This document is the single source of truth for *what* the system must do. All design (SDD) and implementation (Development Plan) decisions must trace back to requirements listed here.

### 1.2 Scope
CreatorAi is a web-based platform that helps content creators:

1. Store and organize videos, images, audio, scripts, and related assets in one place.
2. Generate hooks, scripts, and supporting content using AI.
3. Align scripts with raw footage using AI understanding of text and video.
4. Automatically identify highlight sections and generate short-form clips.
5. Apply AI-assisted edits that remain fully editable by the creator.
6. Adapt content for multiple platforms (YouTube, Instagram Reels, TikTok, LinkedIn, etc.).
7. Manage the content lifecycle from idea → publish.
8. Provide basic creator intelligence (performance and production insights).

**Out of scope for this version (MVP):**
- Native mobile apps (iOS/Android).
- Real-time collaborative multi-user editing (Google Docs–style simultaneous cursors).
- Direct OAuth publishing to all social platforms (stubs/adapters allowed; full OAuth optional if time permits).
- Advanced color grading / professional NLE feature parity with Premiere/Final Cut.
- Paid billing / subscription management.

### 1.3 Definitions, Acronyms, Abbreviations

| Term | Meaning |
|------|---------|
| **Asset** | Any media file or document: video, image, audio, script, thumbnail, caption file |
| **Project** | A container for related assets, scripts, edits, and publish targets for one content piece |
| **Clip** | A short-form segment extracted from long-form footage |
| **Hook** | Opening line/visual designed to retain viewer attention in the first 1–3 seconds |
| **Edit Timeline** | Ordered list of editable cuts, overlays, captions, and transitions |
| **Platform Pack** | Output package sized/formatted for a specific social platform |
| **NLE** | Non-Linear Editor (timeline-based video editor) |
| **SRS** | Software Requirements Specification |
| **SDD** | Software Design Document |
| **API** | Application Programming Interface |
| **MVP** | Minimum Viable Product |

### 1.4 References
- Problem Statement: CreatorAi (Bit n Build Maharashtra Round)
- Companion documents: `SDD.md`, `DEVELOPMENT_PLAN.md`, `context.md`

### 1.5 Overview of This Document
- Section 2 — Overall description
- Section 3 — Functional requirements
- Section 4 — Non-functional requirements
- Section 5 — External interfaces
- Section 6 — Data requirements
- Section 7 — Constraints & assumptions
- Section 8 — Acceptance criteria & priority
- Section 9 — Traceability matrix (feature → requirements)

---

## 2. Overall Description

### 2.1 Product Perspective
CreatorAi is a standalone web application with:
- A browser-based frontend (dashboard, asset library, editor, workflow board).
- A backend API server.
- A media processing/worker layer (transcription, clip cutting, AI jobs).
- Object storage for media files.
- A relational database for metadata, users, projects, workflows.

It integrates with external AI providers (LLM + multimodal models) and optionally with social platform APIs.

### 2.2 Product Functions (Summary)
1. **User accounts & workspaces** — sign up, login, personal workspace.
2. **Asset management** — upload, tag, search, preview, organize assets.
3. **Project & workflow** — create projects, move content through lifecycle stages.
4. **AI script & hook generation** — generate and refine scripts/hooks/captions.
5. **Script–footage linking** — map script lines to video timestamps.
6. **Automated clip generation** — propose and render short clips from long footage.
7. **AI-assisted editable editing** — generate edit timelines the user can tweak.
8. **Multi-platform adaptation** — produce aspect ratios, captions, titles per platform.
9. **Publishing workflow** — schedule/mark publish status; export packs.
10. **Creator intelligence** — dashboards for production stats and (optional) engagement metrics.

### 2.3 User Classes

| User Class | Description | Priority |
|------------|-------------|----------|
| **Creator (primary)** | Solo content creator producing video + short-form content | High |
| **Creator Manager** | Person managing multiple projects/assets for a creator | Medium |
| **Admin** | Internal admin for system health (minimal in MVP) | Low |

### 2.4 Operating Environment
- Modern Chromium-based browsers (Chrome/Edge) and Firefox latest two versions.
- Desktop-first UI; responsive enough for tablet.
- Backend runnable on Linux.
- Local/dev: Docker optional; Node.js + Python workers acceptable for media.

### 2.5 Design & Implementation Constraints
- Team of 4 developers working in isolated ownership zones per phase (see Development Plan).
- Must keep AI edits **editable** (export an edit decision list / timeline JSON, not only a baked MP4).
- Prefer open formats: MP4 (H.264), MP3/WAV, PNG/JPEG/WebP, SRT/VTT, JSON timelines.
- Secrets (API keys) never committed to git; use `.env`.

### 2.6 Assumptions & Dependencies
- Creators provide raw footage and at least a rough script/idea.
- External AI APIs are available (or mockable for offline demos).
- FFmpeg is available on the media worker host.
- Internet connectivity for AI features during demo (with mocked fallbacks for judging if needed).

---

## 3. Functional Requirements

Requirements use IDs: `FR-<AREA>-<NNN>`. Priority: **P0** (must MVP), **P1** (should), **P2** (nice).

### 3.1 Authentication & Workspace

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-001 | System shall allow a user to register with email and password. | P0 |
| FR-AUTH-002 | System shall allow a user to log in and receive a session/JWT. | P0 |
| FR-AUTH-003 | System shall allow a user to log out and invalidate the session. | P0 |
| FR-AUTH-004 | System shall associate all user data with their workspace/account. | P0 |
| FR-AUTH-005 | System shall reject unauthorized access to another user's assets/projects. | P0 |

### 3.2 Asset Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AST-001 | User shall upload video, image, audio, and document (script/text) assets. | P0 |
| FR-AST-002 | System shall store original files and generate preview thumbnails where applicable. | P0 |
| FR-AST-003 | User shall view a library of assets with name, type, size, created date. | P0 |
| FR-AST-004 | User shall add tags and a free-text description to an asset. | P0 |
| FR-AST-005 | User shall search/filter assets by name, type, and tags. | P0 |
| FR-AST-006 | User shall delete an asset (soft-delete preferred). | P0 |
| FR-AST-007 | User shall attach assets to a project. | P0 |
| FR-AST-008 | System shall extract basic media metadata (duration, resolution, codec) for videos. | P1 |
| FR-AST-009 | User shall organize assets into folders or collections. | P1 |

### 3.3 Project & Content Workflow

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-WF-001 | User shall create a project with title, description, and target platforms. | P0 |
| FR-WF-002 | Project shall support lifecycle stages: Idea → Script → Recorded → Editing → Clips → Adapted → Ready → Published. | P0 |
| FR-WF-003 | User shall move a project between stages manually. | P0 |
| FR-WF-004 | User shall view a board/list of projects by stage. | P0 |
| FR-WF-005 | System shall record stage-change history with timestamps. | P1 |
| FR-WF-006 | User shall link scripts, footage, edits, and platform packs to a project. | P0 |

### 3.4 AI Script & Hook Generation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SCR-001 | User shall provide a topic, audience, tone, and platform to generate a script. | P0 |
| FR-SCR-002 | System shall generate a structured script (hook, body beats, CTA). | P0 |
| FR-SCR-003 | User shall regenerate or refine a script via follow-up instructions. | P0 |
| FR-SCR-004 | System shall generate multiple hook variants for a given script. | P0 |
| FR-SCR-005 | System shall generate supporting content: titles, captions, hashtags, description. | P0 |
| FR-SCR-006 | User shall edit and save generated text as versioned script documents. | P0 |
| FR-SCR-007 | System shall store script versions with timestamps. | P1 |

### 3.5 Script-to-Video Understanding

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-STV-001 | User shall select a script and one or more footage assets in a project. | P0 |
| FR-STV-002 | System shall transcribe footage audio to text with timestamps. | P0 |
| FR-STV-003 | System shall align script sections to transcript timestamps (mapping). | P0 |
| FR-STV-004 | User shall view the mapping (script line ↔ time range) in the UI. | P0 |
| FR-STV-005 | User shall manually correct mappings. | P0 |
| FR-STV-006 | System shall flag script sections with weak/no footage match. | P1 |

### 3.6 Automated Clip Generation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CLP-001 | System shall propose candidate clip segments from long-form footage using transcript + script + heuristics/AI scoring. | P0 |
| FR-CLP-002 | Each candidate shall include start/end time, title suggestion, and confidence score. | P0 |
| FR-CLP-003 | User shall accept, reject, or tweak clip boundaries. | P0 |
| FR-CLP-004 | System shall render accepted clips as new video assets. | P0 |
| FR-CLP-005 | System shall generate caption files (SRT/VTT) for clips when transcription exists. | P1 |
| FR-CLP-006 | User shall batch-generate multiple clips from one long video. | P1 |

### 3.7 AI-Assisted Editing (Editable)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ED-001 | System shall generate an **edit timeline JSON** (not only a final render) for a project. | P0 |
| FR-ED-002 | Timeline shall include ordered clips/cuts, text overlays, caption tracks, and basic transitions. | P0 |
| FR-ED-003 | User shall edit timeline items in the UI (trim, reorder, edit text, toggle overlays). | P0 |
| FR-ED-004 | User shall re-render the current timeline to a preview video. | P0 |
| FR-ED-005 | System shall keep previous timeline versions. | P1 |
| FR-ED-006 | AI suggestions shall never overwrite user timeline without explicit apply. | P0 |

### 3.8 Multi-Platform Adaptation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PLT-001 | System shall support target formats: 16:9, 9:16, 1:1 at configurable resolutions. | P0 |
| FR-PLT-002 | User shall select platforms (YouTube, Instagram Reels, TikTok, LinkedIn, Shorts). | P0 |
| FR-PLT-003 | System shall generate platform packs: resized/reframed video + title + caption + hashtags. | P0 |
| FR-PLT-004 | System shall suggest safe crop/reframe regions (center or face-aware if available). | P1 |
| FR-PLT-005 | User shall download platform pack assets. | P0 |
| FR-PLT-006 | Publishing status per platform shall be trackable (Draft / Ready / Published). | P0 |

### 3.9 Creator Intelligence

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-INT-001 | System shall show production metrics: projects created, clips generated, assets uploaded, time-in-stage. | P0 |
| FR-INT-002 | System shall show content mix by platform pack type. | P1 |
| FR-INT-003 | User may manually enter post-publish engagement metrics (views, likes) for insights. | P1 |
| FR-INT-004 | System shall surface simple insights (e.g., most used hooks style, avg clip length). | P2 |

### 3.10 System / Jobs

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-JOB-001 | Long-running work (transcribe, render, AI analyze) shall run as background jobs. | P0 |
| FR-JOB-002 | User shall see job status: queued, running, succeeded, failed. | P0 |
| FR-JOB-003 | Failed jobs shall expose a readable error message. | P0 |
| FR-JOB-004 | System shall allow retry of failed jobs. | P1 |

---

## 4. Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-001 | API p95 response time for non-media CRUD endpoints < 500ms on local/dev hardware. | P1 |
| NFR-002 | Upload shall support at least 500MB files in MVP (chunked if needed). | P0 |
| NFR-003 | Timeline JSON schema shall be versioned and documented. | P0 |
| NFR-004 | All secrets via environment variables. | P0 |
| NFR-005 | Core flows usable on 1280×720 and 1920×1080 viewports. | P0 |
| NFR-006 | System shall log errors with request/job IDs. | P1 |
| NFR-007 | Soft deletes for assets/projects to allow recovery during demo. | P1 |
| NFR-008 | AI features shall degrade gracefully with mock responses if API key missing. | P0 |
| NFR-009 | Codebase shall be modular so 4 developers can own separate packages/dirs. | P0 |
| NFR-010 | README shall include how to run frontend, backend, and workers locally. | P0 |

---

## 5. External Interface Requirements

### 5.1 User Interfaces
- **Auth screens**: Register, Login.
- **Dashboard**: Recent projects, job statuses, quick stats.
- **Asset Library**: Grid/list, upload, filters, preview modal.
- **Project Detail**: Stage, linked assets, script panel, mapping panel, clips, timeline editor, platform packs.
- **Workflow Board**: Kanban by stage.
- **Intelligence**: Charts/tables of production metrics.
- **Job Center**: List of background jobs.

### 5.2 Software Interfaces
- REST (or tRPC/JSON) API between frontend and backend.
- AI provider HTTP APIs (LLM + optional multimodal).
- Speech-to-text API or local Whisper.
- FFmpeg CLI for media transforms.
- Optional: social platform APIs (stubs OK).

### 5.3 Communication Interfaces
- HTTPS in production; HTTP acceptable for local demo.
- WebSocket or polling for job progress (polling acceptable for MVP).

---

## 6. Data Requirements

### 6.1 Core Entities
- User
- Workspace (1:1 with User in MVP)
- Asset
- Project
- ScriptDocument (+ versions)
- Transcript (+ segments)
- ScriptFootageMap
- ClipCandidate / Clip
- EditTimeline (+ versions)
- PlatformPack
- Job
- InsightMetric (optional manual engagement)

### 6.2 Retention
- Soft-deleted records retained for the event duration unless hard-deleted by user/admin.

---

## 7. Constraints & Assumptions

### 7.1 Constraints
- Development time boxed by event schedule; MVP prioritizes P0 requirements.
- Four developers must work independently within a phase; only merge during Integration Mini-Phases.
- Media processing quality may be “demo good,” not broadcast grade.

### 7.2 Assumptions
- Demo can use sample footage under 10 minutes for reliability.
- Judges will accept mocked social publish with export packs.
- English-first UI and transcription for MVP.

---

## 8. Acceptance Criteria (MVP Gate)

The MVP is accepted when a creator can complete this **golden path**:

1. Sign up / log in.
2. Create a project and set target platforms.
3. Upload a script (or generate one) and raw footage.
4. Run transcription + script–footage mapping; correct one mapping.
5. Generate clip candidates; accept at least one; render clip asset.
6. Generate an editable timeline; change one overlay/caption; re-render preview.
7. Generate at least two platform packs (e.g., 16:9 and 9:16).
8. Move project stages through to Ready/Published.
9. View basic intelligence metrics on the dashboard.

All steps must work with documented local setup instructions.

---

## 9. Requirements Traceability (Feature → FR IDs)

| Problem Feature | Requirement IDs |
|-----------------|-----------------|
| Asset Management | FR-AST-* |
| AI Script & Hook Generation | FR-SCR-* |
| Script-to-Video Understanding | FR-STV-* |
| Automated Clip Generation | FR-CLP-* |
| AI-Assisted Editing | FR-ED-* |
| Multi-Platform Adaptation | FR-PLT-* |
| Content Workflow | FR-WF-* |
| Creator Intelligence | FR-INT-* |

---

## 10. Document Control
- Updates to requirements must update this SRS and note the change in `context.md`.
- Requirement ID numbers are stable; do not reuse IDs for different meanings.
