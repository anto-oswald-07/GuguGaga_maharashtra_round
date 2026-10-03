# CreatorAi — AI Contracts

> **Owner:** Dev C (Arvin)  
> **Status:** Phase 5 — `packages/ai-provider` implemented (mock + openai + gemini).  
> **Source of truth:** `SDD.md` §7 (AI Subsystem Design).  
> **Package README:** `packages/ai-provider/README.md`

---

## Provider interface (from SDD)

```ts
interface AiProvider {
  generateScript(input: ScriptGenInput): Promise<ScriptGenResult>;
  generateHooks(script: string, n: number): Promise<string[]>;
  generateSupporting(script: string, platforms: Platform[]): Promise<SupportingContent>;
  alignScriptToTranscript(script: ScriptDoc, segments: TranscriptSegment[]): Promise<Alignment[]>;
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
| `alignScriptToTranscript` | 6 | Stub (`not_implemented`) |
| `scoreClipWindows` | 7 | Stub (`not_implemented`) |
| `proposeTimeline` | 8 | Stub (`not_implemented`) |

---

## Implementations

| Class | Role |
|-------|------|
| `MockAiProvider` | Deterministic fixtures (default `AI_PROVIDER=mock`) |
| `OpenAiProvider` | Chat Completions when `OPENAI_API_KEY` set |
| `GeminiProvider` | generateContent when `GEMINI_API_KEY` set |

```bash
AI_PROVIDER=mock
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Factory: `createAiProvider()` from `@creatorai/ai-provider`.

---

## Worker consumer

- `services/worker/src/consumers/generateScript.ts` — `processGenerateScriptJob`
- CLI: `pnpm --filter worker generate-script`
- Persistence: optional `WORKER_CALLBACK_URL` until Anto Job/ScriptVersion tables exist

---

## Prompt templates

Inline in OpenAI/Gemini classes for MVP. Dev D may add `docs/ai/prompts/**` + shared Zod (`scriptSchema`) without owning `packages/ai-provider` code.

---

## Sample fixtures

- Demo script: `samples/scripts/sample_script.md`
- Demo pack notes: `samples/README.md`
