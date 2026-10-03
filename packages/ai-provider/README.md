# `@creatorai/ai-provider`

LLM + STT + clip scoring + timeline + platform-copy provider package for CreatorAi (Phases 5–10 — Dev C / Arvin).

## Providers

| `AI_PROVIDER` | Class | Needs |
|---------------|-------|--------|
| `mock` (default) | `MockAiProvider` | nothing — **deterministic** from topic / hintText + optional `AI_MOCK_SEED` |
| `auto` | `FallbackAiProvider` | first available key in fallback order |
| `openai` | `OpenAiProvider` | `OPENAI_API_KEY` (Chat + Whisper) |
| `gemini` | `GeminiProvider` | `GEMINI_API_KEY` (chat; STT falls back to mock segments) |
| `grok` | `GrokProvider` | `XAI_API_KEY` (scripts + asset-aware timeline; STT → mock) |
| `openrouter` | `OpenRouterProvider` | `OPENROUTER_API_KEY` (default model `qwen/qwen3.8-27b:free`) |
| `groq` | `GroqProvider` | `GROQ_API_KEY` |
| `mistral` | `MistralProvider` | `MISTRAL_API_KEY` |

**Automatic backups:** for any live primary (`gemini`, `grok`, …) or `auto`, other providers that have keys are chained. On `429` / quota / credit errors the next backend is tried. Ends with `mock` so the app never hard-fails. Disable with `AI_FALLBACK=0`.

Default order: `gemini → openrouter → groq → mistral → openai → grok → mock`  
Override with `AI_FALLBACK_PROVIDERS=…`.

**Never commit API keys.** Put them in root `.env` (gitignored) only.

### Demo stability (Phase 10)

- `MockAiProvider` does **not** use `Math.random` / wall-clock for content.
- Optional `AI_MOCK_SEED` (or `createAiProvider({ mockSeed })`) only selects a deterministic hash lane.
- Identical seed + inputs → identical scripts, hooks, STT segments, clip scores, timelines, pack copy.
- Offline judge path: keep `AI_PROVIDER=mock` — see `docs/demo/offline-fallbacks.md`.

## Setup

```bash
# root .env
AI_PROVIDER=mock
# AI_MOCK_SEED=creatorai-demo
# AI_PROVIDER=auto
# AI_FALLBACK=1
# AI_FALLBACK_PROVIDERS=gemini,openrouter,groq,mistral,openai,grok,mock
# GEMINI_API_KEY=...
# GEMINI_MODEL=gemini-3.8-flash
# OPENROUTER_API_KEY=...
# OPENROUTER_MODEL=qwen/qwen3.8-27b:free
# GROQ_API_KEY=...
# GROQ_MODEL=openai/gpt-oss-20b
# MISTRAL_API_KEY=...
# MISTRAL_MODEL=mistral-small-latest
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_WHISPER_MODEL=whisper-1
# XAI_API_KEY=xai-...   # console.x.ai
# XAI_MODEL=grok-4.3
```

```bash
pnpm install
pnpm --filter @creatorai/ai-provider build
pnpm --filter @creatorai/ai-provider test
```

## Usage

```ts
import { createAiProvider } from '@creatorai/ai-provider';

const ai = createAiProvider(); // reads AI_PROVIDER (+ fallbacks)

const script = await ai.generateScript({
  topic: 'Batch Reels in one afternoon',
  audience: 'solo creators',
  tone: 'practical',
  platform: 'INSTAGRAM_REELS',
});

// Phase 6 — mock STT from spoken text (or Whisper when file + openai)
const { segments } = await ai.transcribe({
  hintText: script.fullText,
});

const alignments = await ai.alignScriptToTranscript(
  { hook: script.hook, body: script.body, cta: script.cta },
  segments,
);
// alignments[].confidence ∈ [0, 1]

// Phase 7 — rank 15–60s clip windows (always 3 stable candidates for mock)
const clipIdeas = await ai.scoreClipWindows(
  { segments },
  { hook: script.hook, body: script.body, cta: script.cta },
);
// clipIdeas[].score ∈ [0, 1]; titleSuggestion + rationale

// Phase 8 — EditTimeline JSON (clips stacked + hook text overlay 0–3s)
const timeline = await ai.proposeTimeline({
  script: { hook: script.hook, body: script.body, cta: script.cta },
  alignments,
  acceptedClips: clipIdeas.map((c) => ({
    startMs: c.startMs,
    endMs: c.endMs,
    titleSuggestion: c.titleSuggestion,
  })),
  sourceAssetId: '…',
});
// timeline.schemaVersion === '1.0'; tracks: video | text | captions

// Phase 9 — platform-tuned titles / captions / hashtags (soft length limits)
const supporting = await ai.generateSupporting(script.fullText, [
  'YOUTUBE',
  'INSTAGRAM_REELS',
  'TIKTOK',
]);
// supporting.byPlatform.TIKTOK.titles[0] starts with "[TikTok]"
```

## Worker consumers

| Job | CLI |
|-----|-----|
| `GENERATE_SCRIPT` | `pnpm --filter worker generate-script` |
| `TRANSCRIBE` | `pnpm --filter worker transcribe -- --hint-text "..."` |
| `ALIGN_SCRIPT` | `pnpm --filter worker align -- --fixture` |
| `SCORE_CLIPS` | `pnpm --filter worker score-clips -- --fixture` |
| `GENERATE_TIMELINE` | `pnpm --filter worker generate-timeline -- --fixture` |
| `GENERATE_SUPPORTING` | `pnpm --filter worker generate-platform-copy -- --fixture` |

Helpers: `services/worker/src/ai/{provider,transcribe,align,scoreClips,proposeTimeline,generatePlatformCopy}.ts`

## Alignment (MVP)

Pure fuzzy match in `src/align/fuzzyAlign.ts` (token Jaccard + ordered overlap).  
Used by mock / openai / gemini so confidence scores stay consistent without an embed API.

## Clip scoring (MVP)

Pure heuristic in `src/clips/scoreClipWindows.ts`:
- Candidate windows 15 / 30 / 45 / 60s stepped across transcript
- Score = script cue overlap + duration fit (~30s) + spoken hook/list cues
- Returns top 3 non-overlapping ideas (stable for identical inputs)
- Empty/short transcript → 3 stable demo windows

## Timeline proposal (MVP)

Pure builder in `src/timeline/proposeTimeline.ts`:
- Stacks `acceptedClips` (or `clipIdeas`, or stable demo windows) on a video track
- Hook text overlay at **0–3000 ms** on a text track
- Optional caption items from high-confidence alignments
- Local shape assert (`assertValidTimelineShape`); uses `@creatorai/timeline-schema` when present (Cyrus Phase 8 D)
- Identical inputs → identical timeline JSON

## Platform copy (MVP)

Pure builder in `src/platform/generatePlatformCopy.ts` + limits in `copyLimits.ts`:
- Soft title/caption/hashtag caps per Platform (see `docs/ai/platform-copy-guidelines.md`)
- Mock titles/captions prefixed with `[YT]` / `[Shorts]` / `[Reels]` / `[TikTok]` / `[LinkedIn]`
- OpenAI / Gemini responses clamped via `clampSupportingItem`
- Identical script + platforms → identical `SupportingContent`

## Fixtures / tests

- `test/fixtures/sample_script.json`
- `test/fixtures/sample_spoken.txt`
- `test/fixtures/sample_timeline_context.json`
- `test/fixtures/sample_platform_copy.json`
- `pnpm --filter @creatorai/ai-provider test`
