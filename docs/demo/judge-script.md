# Judge Demo Script — CreatorAi Golden Path (SRS §8)

> **Owner:** Dev C (Arvin) — Phase 10  
> **Prep companion:** `docs/demo/golden-path-prep.md`  
> **Offline / AI fallbacks:** `docs/demo/offline-fallbacks.md`  
> **Seed:** `pnpm --filter @creatorai/ai-provider exec tsx ../../scripts/demo/seed-demo.ts`

Walk this **click-by-click**. Target ~8–12 minutes with `AI_PROVIDER=mock` and `storage/samples/dummy.mp4`.

---

## 0. Before the judge sits down (operator)

```bash
# From repo root
cp -n .env.example .env   # if needed; keep AI_PROVIDER=mock
docker compose up -d      # Postgres (use POSTGRES_HOST_PORT=5433 if :5432 busy)
pnpm install
pnpm --filter @creatorai/shared build
pnpm --filter @creatorai/ai-provider build
cd services/api && pnpm run prisma:deploy && pnpm run prisma:generate && cd ../..

./scripts/media/check-ffmpeg.sh
./scripts/media/make-dummy-video.sh   # → storage/samples/dummy.mp4

# Terminal A
pnpm --filter api dev

# Terminal B
pnpm --filter web exec next dev -p 3002

# Optional: pre-create demo user + project + footage + sample script
pnpm --filter @creatorai/ai-provider exec tsx ../../scripts/demo/seed-demo.ts
```

Open **http://localhost:3002**. Confirm API health: `curl http://localhost:4000/api/v1/health`.

Demo account (if seeded): `demo@creatorai.local` / `password123`.

---

## 1. Sign up / log in (SRS §8.1)

**If seeded:**

1. Click **Login** in the nav.
2. Email `demo@creatorai.local`, password `password123` → Submit.
3. Land on Dashboard (`/dashboard`).

**Cold path (no seed):**

1. Click **Register** → name / email / password → Submit.
2. Or **Login** with the account you just created.

---

## 2. Create project + platforms (SRS §8.2)

**If seed already created “Batch Reels in One Afternoon”:** open **Projects** → that row → skip to step 3 (script may already exist).

**Else:**

1. Nav → **Projects** → **New project** (or Create).
2. Title: `Batch Reels in One Afternoon`.
3. Select platforms: **Instagram Reels**, **YouTube Shorts**, **TikTok** (add LinkedIn only if you want a 1:1 pack later).
4. Save / Create → open the project.

Confirm Overview shows stage **IDEA** (or earliest stage).

---

## 3. Script + footage (SRS §8.3)

### 3a. Script tab

1. Project tabs → **Script**.
2. Either:
   - **Generate script** with topic `How I batch-create Reels in one afternoon`, audience `solo creators`, tone `practical`, platform Reels — wait for job banner **SUCCEEDED**, **or**
   - If seed ran: open the existing script version (from `samples/scripts/sample_script.md`).
3. Optionally click **Save as new version**.

### 3b. Attach footage

1. Tab → **Overview** (or Assets library).
2. Upload `storage/samples/dummy.mp4` if not already attached (Assets → upload → project Overview → attach).
3. Confirm a VIDEO asset appears on the project.

Stage should move toward **SCRIPT** / **RECORDED** as you progress (UI may require manual stage move on Overview — use Stage controls if shown).

---

## 4. Transcribe + map; correct one mapping (SRS §8.4)

1. Tab → **Footage & Mapping**.
2. Select the uploaded video → **Transcribe selected footage** → wait **SUCCEEDED**.
3. Select the script → **Align script** → wait **SUCCEEDED**.
4. In the mapping table, click one row → edit (nudge start/end or text) → **Save**.
5. Point out the confidence / threshold behavior if a low-confidence row appears (~0.55).

---

## 5. Propose clips; accept one; render (SRS §8.5)

1. Tab → **Clips**.
2. **Propose clips** → wait for candidates (mock returns **3** stable windows).
3. Select the top candidate → **Accept**.
4. **Render** → wait **SUCCEEDED**.
5. Show render preview / download link.

---

## 6. Timeline; edit one overlay; re-render (SRS §8.6)

1. Tab row → **Editor** (`/projects/:id/editor`).
2. **Suggest timeline** → wait for proposal.
3. **Apply (draft + save)** — proposals never overwrite until Apply.
4. Edit the hook text overlay (0–3s) — change one word (e.g. add `!`).
5. **Save** if needed → **Render preview** → wait **SUCCEEDED**.
6. Show preview pane.

---

## 7. ≥2 platform packs (SRS §8.7)

1. Back to project → **Platform Packs**.
2. Select at least **YouTube** (16:9) and **TikTok** or **Instagram Reels** (9:16). Optionally LinkedIn (1:1).
3. **Generate packs** → wait **SUCCEEDED**.
4. Show distinct titles (mock prefixes `[YT]` / `[TikTok]` / `[Reels]` / …) and that output assets exist.
5. Optionally open Download on one pack.

---

## 8. Ready / Published (SRS §8.8)

1. On a pack card: tweak title if desired → **Save copy**.
2. **Mark Ready** → then **Mark Published** (or Ready on one, Published on another).
3. Overview → Stage controls: advance project toward **READY** / **PUBLISHED** if not auto-advanced.

---

## 9. Insights metrics (SRS §8.9)

1. Nav → **Insights** (and/or Dashboard `/dashboard`).
2. Show project / asset / clip / job counts or stage distribution (Phase 10 A/B).
3. If engagement form is present, submit a sample views/likes value.

> If Insights API/UI is still landing, say: “Metrics wire in Phase 10 A/B; packs + jobs data already in DB.” Do not block the rest of the golden path.

---

## 10. Cold start proof (SRS §8 close)

From a clean terminal, show that root README / this prep brings the system up (compose + `pnpm install` + api/web + mock). Point at `docs/demo/offline-fallbacks.md` when there is no internet / no API keys.

---

## Talking points (30 seconds each)

| Beat | Line |
|------|------|
| Mock AI | “`AI_PROVIDER=mock` — deterministic, no keys, same topic → same script.” |
| Mapping | “Fuzzy align; you can correct any row — human stays in the loop.” |
| Clips | “Three scored windows; accept → ffmpeg cut (or safe copy fallback).” |
| Editor | “Suggest ≠ apply — FR-ED-006.” |
| Packs | “Copy length-tuned per platform + aspect crop 16:9 / 9:16 / 1:1.” |

---

## If something breaks mid-demo

| Symptom | Fix |
|---------|-----|
| Web hangs / blank | Restart: `pnpm --filter web exec next dev -p 3002` |
| Jobs stuck QUEUED | Confirm API log shows `[jobs/processor] polling` |
| ffmpeg errors | `./scripts/media/check-ffmpeg.sh`; pipeline may mock-copy |
| AI errors / no keys | Force `AI_PROVIDER=mock` in `.env`, restart API |
| No dummy video | `./scripts/media/make-dummy-video.sh` |
| Auth fail | Re-run `pnpm --filter @creatorai/ai-provider exec tsx ../../scripts/demo/seed-demo.ts` or register fresh |

Full offline matrix: **`docs/demo/offline-fallbacks.md`**.
