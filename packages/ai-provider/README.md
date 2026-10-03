# `@creatorai/ai-provider`

LLM + STT + clip scoring provider package for CreatorAi (Phases 5–7 — Dev C / Arvin).

## Providers

| `AI_PROVIDER` | Class | Needs |
|---------------|-------|--------|
| `mock` (default) | `MockAiProvider` | nothing — deterministic from topic / hintText |
| `openai` | `OpenAiProvider` | `OPENAI_API_KEY` (Chat + Whisper) |
| `gemini` | `GeminiProvider` | `GEMINI_API_KEY` (chat; STT falls back to mock segments) |

**Never commit API keys.** Put them in root `.env` (gitignored) only.

## Setup

```bash
# root .env
AI_PROVIDER=mock
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_WHISPER_MODEL=whisper-1
# AI_PROVIDER=gemini
# GEMINI_API_KEY=...
# GEMINI_MODEL=gemini-2.0-flash
```

```bash
pnpm install
pnpm --filter @creatorai/ai-provider build
pnpm --filter @creatorai/ai-provider test
```

## Usage

```ts
import { createAiProvider } from '@creatorai/ai-provider';

const ai = createAiProvider(); // reads AI_PROVIDER

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
```

## Worker consumers

| Job | CLI |
|-----|-----|
| `GENERATE_SCRIPT` | `pnpm --filter worker generate-script` |
| `TRANSCRIBE` | `pnpm --filter worker transcribe -- --hint-text "..."` |
| `ALIGN_SCRIPT` | `pnpm --filter worker align -- --fixture` |
| `SCORE_CLIPS` | `pnpm --filter worker score-clips -- --fixture` |

Helpers: `services/worker/src/ai/{provider,transcribe,align,scoreClips}.ts`

## Alignment (MVP)

Pure fuzzy match in `src/align/fuzzyAlign.ts` (token Jaccard + ordered overlap).  
Used by mock / openai / gemini so confidence scores stay consistent without an embed API.

## Clip scoring (MVP)

Pure heuristic in `src/clips/scoreClipWindows.ts`:
- Candidate windows 15 / 30 / 45 / 60s stepped across transcript
- Score = script cue overlap + duration fit (~30s) + spoken hook/list cues
- Returns top 3 non-overlapping ideas (stable for identical inputs)
- Empty/short transcript → 3 stable demo windows

## Fixtures / tests

- `test/fixtures/sample_script.json`
- `test/fixtures/sample_spoken.txt`
- `pnpm --filter @creatorai/ai-provider test`

## Phase stubs

`proposeTimeline` (8) still throws `not_implemented`.
