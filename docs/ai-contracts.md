# CreatorAi — AI Contracts

> **Owner:** Dev C (Arvin)  
> **Status:** Phase 9 — `generateSupporting` platform-tuned (length limits + distinct mock labels).  
> **Source of truth:** `SDD.md` §7 (AI Subsystem Design) + `docs/ai/platform-copy-guidelines.md`.  
> **Package README:** `packages/ai-provider/README.md`

---

## Provider interface

```ts
interface AiProvider {
  generateScript(input: ScriptGenInput): Promise<ScriptGenResult>;
  generateHooks(script: string, n: number): Promise<string[]>;
  /** Phase 5 / 9 — titles/captions/hashtags per platform (soft length limits). */
  generateSupporting(script: string, platforms: Platform[]): Promise<SupportingContent>;
  /** Phase 6 — STT (Whisper or mock segments from hintText). */
  transcribe(input: TranscribeInput): Promise<Transcript>;
  alignScriptToTranscript(script: ScriptDoc, segments: TranscriptSegment[]): Promise<Alignment[]>;
  /** Phase 7 — rank 15–60s windows → ClipIdea[] (title + score 0–1). */
  scoreClipWindows(transcript: Transcript, script: ScriptDoc): Promise<ClipIdea[]>;
  proposeTimeline(ctx: TimelineContext): Promise<EditTimeline>;
}
```

### Method summary

| Method | Phase | Status |
|--------|-------|--------|
| `generateScript` | 5 | **Done** — mock + openai + gemini + grok + openrouter + groq + mistral (+ **auto fallback**) |
| `generateHooks` | 5 | **Done** |
| `generateSupporting` | 5 / 9 | **Done** — platform-tuned copy + soft clamp; see `docs/ai/platform-copy-guidelines.md` |
| `transcribe` | 6 | **Done** — mock word segments; OpenAI Whisper when file + key |
| `alignScriptToTranscript` | 6 | **Done** — fuzzy match MVP, confidence 0–1 |
| `scoreClipWindows` | 7 | **Done** — heuristic 15–60s windows; 3 stable mock candidates |
| `proposeTimeline` | 8 | **Done** — EditTimeline `schemaVersion: 1.0`; **grok** analyses assets for holds/audio |

---

## Implementations

| Class | Role |
|-------|------|
| `MockAiProvider` | Deterministic fixtures (default `AI_PROVIDER=mock`) |
| `OpenAiProvider` | Chat Completions + Whisper when `OPENAI_API_KEY` set; clip score → mock heuristic; supporting clamped post-hoc |
| `GeminiProvider` | generateContent; STT / clip score use mock fallback; supporting clamped post-hoc |
| `GrokProvider` | xAI Grok (`XAI_API_KEY`) — scripts + **asset-aware** timeline suggestions (image holds / audio mix) |
| `OpenRouterProvider` | OpenRouter Chat Completions (`OPENROUTER_API_KEY`, default `qwen/qwen3.8-27b:free`) |
| `GroqProvider` | Groq Chat Completions (`GROQ_API_KEY`) |
| `MistralProvider` | Mistral Chat Completions (`MISTRAL_API_KEY`) |
| `FallbackAiProvider` | Chains keyed providers; skips on rate limit / quota / credit errors |

```bash
AI_PROVIDER=auto
AI_FALLBACK=1
AI_FALLBACK_PROVIDERS=gemini,openrouter,groq,mistral,openai,grok,mock
GEMINI_API_KEY=
OPENROUTER_API_KEY=
GROQ_API_KEY=
MISTRAL_API_KEY=
OPENAI_API_KEY=
# Free signup credits often available at https://console.x.ai
# XAI_API_KEY=
# XAI_MODEL=grok-4.3
```

Factory: `createAiProvider()` from `@creatorai/ai-provider`. On rate limit / empty credits the next backend in the chain is used; `mock` is always last so jobs keep working offline.

### Grok asset analysis

When `AI_PROVIDER=grok`:
- **Generate script** receives the project’s VIDEO / IMAGE / AUDIO catalog and writes copy that can be covered by that media.
- **Suggest timeline** asks Grok to order stills (hold durations), video trims, and parallel audio beds, returning rationale + change bullets in `meta.notes`.

STT still uses mock (or OpenAI Whisper when `AI_PROVIDER=openai`).

---

## Worker consumers

| Consumer | CLI |
|----------|-----|
| `generateScript.ts` | `pnpm --filter worker generate-script` |
| `transcribe.ts` | `pnpm --filter worker transcribe` |
| `align.ts` | `pnpm --filter worker align -- --fixture` |
| `scoreClips.ts` | `pnpm --filter worker score-clips -- --fixture` |
| `generateTimeline.ts` | `pnpm --filter worker generate-timeline -- --fixture` |
| `generatePlatformCopy.ts` | `pnpm --filter worker generate-platform-copy -- --fixture` |

Helpers: `services/worker/src/ai/{transcribe,align,scoreClips,proposeTimeline,generatePlatformCopy}.ts`

Persistence: optional `WORKER_CALLBACK_URL` until Packs API (Anto Phase 9 B) wires `ADAPT_PLATFORM` / `GENERATE_SUPPORTING` Job rows.

---

## Prompt templates

Inline in OpenAI/Gemini classes for MVP. Dev D may add `docs/ai/prompts/**` + shared Zod without owning `packages/ai-provider` code.

Platform length table: `docs/ai/platform-copy-guidelines.md`.

---

## Sample fixtures

- Demo script: `samples/scripts/sample_script.md`
- Align/STT/clip/timeline/platform fixtures: `packages/ai-provider/test/fixtures/**`
