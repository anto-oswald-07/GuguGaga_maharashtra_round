# Offline / Demo Fallback Switches

> Phase 10 — Dev C (Arvin). Use when the judge machine has **no internet**, **no LLM keys**, or media tools are missing.

Companion: `docs/demo/judge-script.md`.

---

## 1. AI provider switches

| Goal | Setting | Notes |
|------|---------|--------|
| **Default / offline demo** | `AI_PROVIDER=mock` | No network, no keys. Deterministic from inputs + optional `AI_MOCK_SEED`. |
| OpenAI live | `AI_PROVIDER=openai` + `OPENAI_API_KEY` | Needs network. Fail → set back to `mock`, restart API. |
| Gemini live | `AI_PROVIDER=gemini` + `GEMINI_API_KEY` | Chat only; STT still mock-ish without Whisper. |
| Stable mock variation | `AI_MOCK_SEED=judge-demo` | Optional. Same seed → same mock scripts/hooks. **Never enables Math.random.** |

Restart the **API** (job poller) after changing `AI_PROVIDER` / keys / seed.

```bash
# root .env — recommended for judging
AI_PROVIDER=mock
# AI_MOCK_SEED=creatorai-demo
```

Verify mock path without UI:

```bash
AI_PROVIDER=mock pnpm --filter worker generate-script -- --fixture
AI_PROVIDER=mock pnpm --filter worker generate-platform-copy -- --fixture
```

---

## 2. Media / ffmpeg switches

| Situation | Behavior | What to say |
|-----------|----------|-------------|
| ffmpeg present | Real cut / timeline render / aspect adapt (`mode=ffmpeg`) | “Real encode path.” |
| ffmpeg missing / fails | Job handlers **copy** source → still produce an Asset (`mode=mock-copy`) | “Safe fallback so the golden path continues.” |
| No `dummy.mp4` | Run `./scripts/media/make-dummy-video.sh` | Do not commit binaries. |

Check: `./scripts/media/check-ffmpeg.sh`

---

## 3. Infra switches

| Piece | Offline OK? | Fallback |
|-------|-------------|----------|
| Postgres | Local only | `docker compose up -d`; if host `:5432` busy → `POSTGRES_HOST_PORT=5433` + matching `DATABASE_URL` |
| Redis | **Not required** for MVP | DB-polling job queue inside API |
| Web | Local Next on `:3002` | Restart if Turbopack hangs |
| External CDN / fonts | May no-op offline | UI still usable |

---

## 4. Content fallbacks

| Missing | Use |
|---------|-----|
| Generated script flaky | Paste / seed `samples/scripts/sample_script.md` via `scripts/demo/seed-demo.ts` |
| Live Whisper | Mock STT from `hintText` / basename (`MockAiProvider.transcribe`) |
| Live pack copy | Mock `[YT]` / `[TikTok]` / … labels from `generateSupporting` |
| Insights empty | Still show Jobs list + project stage; Insights is Phase 10 A/B |

---

## 5. Quick recovery checklist

1. `curl -s http://localhost:4000/api/v1/health` → `ok`
2. `.env` has `AI_PROVIDER=mock`
3. `storage/samples/dummy.mp4` exists
4. API log includes `[jobs/processor] polling`
5. Web responds: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3002/` → `200`
6. Re-seed if needed: `pnpm --filter @creatorai/ai-provider exec tsx ../../scripts/demo/seed-demo.ts`
