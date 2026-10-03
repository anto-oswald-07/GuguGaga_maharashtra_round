# `@creatorai/ai-provider`

LLM provider package for CreatorAi (Phase 5 — Dev C / Arvin).

## Providers

| `AI_PROVIDER` | Class | Needs |
|---------------|-------|--------|
| `mock` (default) | `MockAiProvider` | nothing — deterministic from topic |
| `openai` | `OpenAiProvider` | `OPENAI_API_KEY` |
| `gemini` | `GeminiProvider` | `GEMINI_API_KEY` |

**Never commit API keys.** Put them in root `.env` (gitignored) only.

## Setup

```bash
# root .env
AI_PROVIDER=mock
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini          # optional
# AI_PROVIDER=gemini
# GEMINI_API_KEY=...
# GEMINI_MODEL=gemini-2.0-flash     # optional
```

```bash
pnpm install
pnpm --filter @creatorai/ai-provider build
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
const hooks = await ai.generateHooks(script.fullText, 3);
const supporting = await ai.generateSupporting(script.fullText, [
  'INSTAGRAM_REELS',
  'YOUTUBE_SHORTS',
]);
```

## Worker consumer

Job handler: `services/worker/src/consumers/generateScript.ts`

```bash
pnpm --filter worker generate-script
# or with JSON stdin / CLI args — see consumer file header
```

Until Anto’s Job / ScriptDocument tables land (Phase 5 B), the consumer:

1. Calls the provider
2. Returns structured output
3. Optionally `POST`s to `WORKER_CALLBACK_URL` (Integration wires persistence)

## Phase stubs

`alignScriptToTranscript`, `scoreClipWindows`, `proposeTimeline` throw `AiProviderError` (`not_implemented`) until Phases 6–8.

## Prompt templates

Inline prompts live in the OpenAI/Gemini classes for MVP. Cyrus (Dev D) may move templates to `docs/ai/prompts/**` + shared Zod — prefer that over editing provider code when possible.
