# CreatorAi (GuguGaga — Maharashtra round)

Bit n Build Maharashtra State Round — **MVP COMPLETE** (Phase 10 Integration).

**Team:** Brendan Rodrigues · Anto Oswald · Arvin Almeida · Cyrus Selvaraj

---

## Cold start (judges / demo)

### Prerequisites
- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Docker **or** Podman (PostgreSQL)
- **ffmpeg** + **ffprobe** on `PATH` (real cuts / aspect adapt; mock-copy fallbacks exist without it)

### 1. Environment
```bash
cp -n .env.example .env
# Keep AI_PROVIDER=mock for offline judging.
# If host :5432 is busy: POSTGRES_HOST_PORT=5433 and matching DATABASE_URL (see .env.example).
```

### 2. Postgres
```bash
docker compose up -d
# or: podman compose up -d
```

### 3. Install, build, migrate
```bash
pnpm install
pnpm --filter @creatorai/shared build
pnpm --filter @creatorai/ai-provider build
pnpm --filter api prisma:deploy
pnpm --filter api prisma:generate
```

### 4. Sample media
```bash
chmod +x scripts/media/*.sh   # if scripts are not executable
./scripts/media/check-ffmpeg.sh
./scripts/media/make-dummy-video.sh          # → storage/samples/dummy.mp4
./scripts/media/bake-demo-fallback.sh        # emergency clip if live render fails
```

### 5. API + Web
```bash
# Terminal A
pnpm --filter api dev
# → http://localhost:4000/api/v1

# Terminal B
pnpm --filter web exec next dev -p 3002
# → http://localhost:3002
```

### 6. Health + optional seed
```bash
curl http://localhost:4000/api/v1/health
# → {"status":"ok","service":"api","db":"up","checkedAt":"..."}

pnpm --filter @creatorai/ai-provider exec tsx ../../scripts/demo/seed-demo.ts
# login: demo@creatorai.local / password123
```

### 7. Judge walkthrough
Click-by-click golden path: [`docs/demo/judge-script.md`](docs/demo/judge-script.md)  
Offline / AI fallbacks: [`docs/demo/offline-fallbacks.md`](docs/demo/offline-fallbacks.md)  
Media checklist: [`docs/demo/media-checklist.md`](docs/demo/media-checklist.md)

---

## What works (MVP)

| Area | Highlights |
|------|------------|
| Auth | Register / login / JWT `me` |
| Assets | Upload, list, content, thumbnail + ffprobe metadata |
| Projects | CRUD, stages, attach assets, Kanban `/workflow` |
| Scripts + Jobs | Generate / refine / hooks / supporting; DB-poller queue; **retry** on FAILED |
| Transcript + Mapping | Transcribe → align → edit mappings |
| Clips | Propose → accept → ffmpeg render |
| Timelines | AI propose → edit → render preview |
| Platform Packs | Multi-platform copy + aspect adapt → status → download URLs |
| Insights | Dashboard cards, `/insights` charts, manual engagement |
| Demo | Seed-stable mock AI (`AI_MOCK_SEED`), demo seed script |

**API base:** `http://localhost:4000/api/v1`  
**Web:** `http://localhost:3002` (prefer `-p 3002` if `:3000` is busy)

---

## Tags / release
- Integration tag targets: `v0.1.0-mvp`, `phase-10-done` (create when releasing to `main`)
