# CreatorAi — AI Contracts

> **Owner:** Dev C (Arvin)  
> **Status:** Phase 8 — `proposeTimeline` implemented on `@creatorai/ai-provider` (clips + hook overlay).  
> **Source of truth:** `SDD.md` §7 (AI Subsystem Design) + §4.3 / `docs/timeline-notes.md`.  
> **Package README:** `packages/ai-provider/README.md`

---

## Provider interface

```ts
interface AiProvider {
  generateScript(input: ScriptGenInput): Promise<ScriptGenResult>;
  generateHooks(script: string, n: number): Promise<string[]>;
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
| `generateScript` | 5 | **Done** — mock + openai + gemini |
| `generateHooks` | 5 | **Done** |
| `generateSupporting` | 5 / 9 | **Done** (basic) |
| `transcribe` | 6 | **Done** — mock word segments; OpenAI Whisper when file + key |
| `alignScriptToTranscript` | 6 | **Done** — fuzzy match MVP, confidence 0–1 |
| `scoreClipWindows` | 7 | **Done** — heuristic 15–60s windows; 3 stable mock candidates |
| `proposeTimeline` | 8 | **Done** — EditTimeline `schemaVersion: 1.0` from clips + hook 0–3s |

---

## Implementations

| Class | Role |
|-------|------|
| `MockAiProvider` | Deterministic fixtures (default `AI_PROVIDER=mock`) |
| `OpenAiProvider` | Chat Completions + Whisper when `OPENAI_API_KEY` set; clip score → mock heuristic |
| `GeminiProvider` | generateContent; STT / clip score use mock fallback |

```bash
AI_PROVIDER=mock
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Factory: `createAiProvider()` from `@creatorai/ai-provider`.

---

## Worker consumers

| Consumer | CLI |
|----------|-----|
| `generateScript.ts` | `pnpm --filter worker generate-script` |
| `transcribe.ts` | `pnpm --filter worker transcribe` |
| `align.ts` | `pnpm --filter worker align -- --fixture` |
| `scoreClips.ts` | `pnpm --filter worker score-clips -- --fixture` |
| `generateTimeline.ts` | `pnpm --filter worker generate-timeline -- --fixture` |

Helpers: `services/worker/src/ai/{transcribe,align,scoreClips,proposeTimeline}.ts`

Persistence: optional `WORKER_CALLBACK_URL` until Timelines API (Anto Phase 8 B) wires `GENERATE_TIMELINE` Job rows.

---

## Prompt templates

Inline in OpenAI/Gemini classes for MVP. Dev D may add `docs/ai/prompts/**` + shared Zod without owning `packages/ai-provider` code.

---

## Sample fixtures

- Demo script: `samples/scripts/sample_script.md`
- Align/STT/clip fixtures: `packages/ai-provider/test/fixtures/**`
