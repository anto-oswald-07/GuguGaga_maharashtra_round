# Golden Path Prep — CreatorAi Demo

> Started Phase 4 (Dev D / Cyrus). Companion fixture: `samples/projects/demo-project.json`.  
> Full judge click-script lands later: `docs/demo/judge-script.md` (Phase 10 / Arvin).

---

## 1. Purpose

Prep checklist so Integration and Phase 10 can walk SRS §8 golden path on a laptop with sample media — no surprise missing fixtures.

---

## 2. Demo project fixture

| Field | Value |
|-------|--------|
| Fixture | `samples/projects/demo-project.json` |
| Title | Batch Reels in One Afternoon |
| Platforms | `INSTAGRAM_REELS`, `YOUTUBE_SHORTS`, `TIKTOK` |
| Script | `samples/scripts/sample_script.md` |
| Footage | `./scripts/media/make-dummy-video.sh` → `storage/samples/dummy.mp4` |
| Seed outline | `npx tsx scripts/seed/sample-project.ts` (`--dry-run` without token) |

---

## 3. Stages the demo will walk

Project stages (SDD / Prisma `ProjectStage`), in order:

| # | Stage | Demo meaning |
|---|-------|----------------|
| 1 | **IDEA** | Project created; platforms set (seed / UI) |
| 2 | **SCRIPT** | Sample or AI-generated script attached / saved |
| 3 | **RECORDED** | Footage uploaded + attached to project |
| 4 | **EDITING** | Transcript + script–footage mapping done (fix one row) |
| 5 | **CLIPS** | Clip candidates proposed; ≥1 accepted + rendered |
| 6 | **ADAPTED** | Timeline edit + ≥2 platform packs (e.g. 16:9 + 9:16) |
| 7 | **READY** | Packs/status ready to publish |
| 8 | **PUBLISHED** | Mark published (mock OK for MVP) |

Kanban `/workflow` columns should mirror this order.

---

## 4. SRS §8 golden path ↔ stages

| Golden-path step (SRS §8) | Typical stage after step |
|---------------------------|--------------------------|
| 1. Sign up / log in | — (auth) |
| 2. Create project + platforms | IDEA |
| 3. Upload/generate script + raw footage | SCRIPT → RECORDED |
| 4. Transcribe + map; correct one mapping | EDITING |
| 5. Propose clips; accept one; render | CLIPS |
| 6. Timeline; edit overlay; re-render | EDITING / ADAPTED prep |
| 7. ≥2 platform packs | ADAPTED |
| 8. Move stages to Ready / Published | READY → PUBLISHED |
| 9. Insights dashboard metrics | (read-only after) |

---

## 5. Local prep before a demo

```bash
# Media
./scripts/media/check-ffmpeg.sh
./scripts/media/make-dummy-video.sh

# Inspect seed payload (no API required)
npx tsx scripts/seed/sample-project.ts --dry-run

# With API + JWT (Integration wires durable demo user later)
# CREATORAI_TOKEN=<jwt> npx tsx scripts/seed/sample-project.ts
```

---

## 6. Open wiring (Integration / later phases)

- [ ] Durable demo user + token for seed script (`TODO_INTEGRATION` in seed file)
- [ ] Optional: auto-attach `dummy.mp4` after upload
- [ ] Phase 5+: load `sample_script.md` into Script tab / Mock AI
- [ ] Phase 10: expand into click-by-click `docs/demo/judge-script.md`

---

## 7. Ownership reminder

| Piece | Owner |
|-------|--------|
| This prep doc + fixture + seed outline | Cyrus (Dev D) |
| Projects API / stages | Anto |
| Projects UI / kanban | Brendan |
| Judge script + mock AI polish | Arvin (Phase 10) |
