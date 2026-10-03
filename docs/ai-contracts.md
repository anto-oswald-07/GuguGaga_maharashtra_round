# AI Provider Contracts (Phase 1 notes)

> Source: `SDD.md` §7. No implementations in Phase 1 — method names locked for later phases.

## Intended `AiProvider` methods

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

## Planned implementations
- `MockAiProvider` — deterministic fixtures for demos/tests (default until keys exist).
- `OpenAiProvider` / `GeminiProvider` — real calls behind `AI_PROVIDER` env.

## Related
- Transcription (Whisper / local) → Phase 6.
- Package home: `packages/ai-provider` (created Phase 5 — Dev C).
- Sample script for demos: `samples/scripts/sample_script.md`.
