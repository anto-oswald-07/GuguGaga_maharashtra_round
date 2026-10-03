# CreatorAi — AI Contracts (Phase 1 notes)

> **Owner:** Dev C (Arvin)  
> **Status:** Interface notes only — **do not implement** providers here until Phase 5+.  
> **Source of truth:** `SDD.md` §7 (AI Subsystem Design).

This document lists the intended `AiProvider` surface so API, worker, and frontend can align before code lands in `packages/ai-provider`.

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

| Method | Phase (target) | Purpose |
|--------|----------------|---------|
| `generateScript` | 5 | Topic/audience/tone/platform → structured script (hook/body/CTA) |
| `generateHooks` | 5 | Alternate hooks from an existing script |
| `generateSupporting` | 5 / 9 | Titles, captions, hashtags (platform-aware) |
| `alignScriptToTranscript` | 6 | Map script sections to transcript time ranges + confidence |
| `scoreClipWindows` | 7 | Rank 15–60s clip candidates |
| `proposeTimeline` | 8 | Build editable timeline JSON from mappings + clips |

---

## Planned implementations

| Class | Role |
|-------|------|
| `MockAiProvider` | Deterministic fixtures for demos/tests (default via `AI_PROVIDER=mock`) |
| `OpenAiProvider` | Real calls when `OPENAI_API_KEY` set |
| `GeminiProvider` | Real calls when `GEMINI_API_KEY` set |

Env (final target — see Development Plan Appendix B):

```bash
AI_PROVIDER=mock
OPENAI_API_KEY=
GEMINI_API_KEY=
```

---

## Transcription (related, not on `AiProvider` in SDD §7.1)

- Prefer Whisper API or local whisper.cpp.
- Normalize to `TranscriptSegment[]` for alignment input.
- Worker entry points planned under `services/worker/src/ai/transcribe.ts` (Phase 6).

---

## Alignment strategy (MVP notes)

1. Fuzzy-match (or embed) script sentences to transcript windows.
2. Emit `startMs` / `endMs` / `confidence` (0–1).
3. Flag low confidence for UI (FR-STV-006).

---

## Clip scoring (MVP notes)

Rank windows by hook keywords, energy proxies, sentence completeness, and duration fitness (15–60s). Return top N candidates with title suggestions.

---

## Sample fixtures

- Demo script: `samples/scripts/sample_script.md`
- Demo pack notes: `samples/README.md`

---

## Non-goals for Phase 1

- No real LLM/STT calls.
- No `packages/ai-provider` package yet (Phase 5).
- No worker consumers yet (Phase 5–8).
