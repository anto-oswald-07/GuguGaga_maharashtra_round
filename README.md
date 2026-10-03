# GuguGaga_maharashtra_round
This is the Repository for the Maharastra State Round of Bit n Build

Team Members
1.Brendan Rodrigues 
2.Anto Oswald
3.Arvin Almeida
4.Cyrus Selvaraj

---

## CreatorAi — Local run (Phase 1 foundation)

### Prerequisites
- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Docker **or** Podman (for PostgreSQL)

### 1. Environment
```bash
cp .env.example .env
```

### 2. Start PostgreSQL
```bash
docker compose up -d
# or: podman compose up -d
```
- Postgres: `localhost:5432` (user/password/db: `creatorai`)
- Optional Redis: `docker compose --profile redis up -d` → `localhost:6379`

### 3. Install & build shared types
```bash
pnpm install
pnpm --filter @creatorai/shared build
```

### 4. Run API
```bash
pnpm --filter api dev
# listens on http://localhost:4000
```

### 5. Health check
```bash
curl http://localhost:4000/api/v1/health
# → {"status":"ok","service":"api"}
```

### 5b. Auth (Phase 2)
```bash
# migrate once
pnpm --filter api prisma:migrate

curl -X POST http://localhost:4000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"password123","name":"Test"}'

curl -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"password123"}'

curl http://localhost:4000/api/v1/auth/me -H "Authorization: Bearer TOKEN"
```

### 6. Web app
```bash
pnpm --filter web dev
# → http://localhost:3000
```

### 7. Worker skeleton
```bash
pnpm --filter worker dev
# → prints "worker skeleton started"
```

### 8. FFmpeg check / dummy video
```bash
./scripts/media/check-ffmpeg.sh
./scripts/media/make-dummy-video.sh   # → storage/samples/dummy.mp4 (gitignored)
```
