import type { Platform } from '@creatorai/shared';

/** Input for Phase 5 script generation (SDD §7.1 / FR script gen). */
export type ScriptGenInput = {
  topic: string;
  audience: string;
  tone: string;
  /** Primary target platform (enum name or free text for mock). */
  platform: Platform | string;
  /** Optional refine instruction (UI “Refine”). */
  refineInstruction?: string;
};

/** Structured script returned by providers. */
export type ScriptGenResult = {
  title: string;
  hook: string;
  body: string;
  cta: string;
  /** Convenience join of hook + body + CTA for editors. */
  fullText: string;
  /** Which provider produced this (mock|openai|gemini). */
  provider: string;
  /** Model id or `mock` when deterministic. */
  model: string;
};

/** Platform-aware supporting copy (titles / captions / hashtags). */
export type SupportingContentItem = {
  titles: string[];
  captions: string[];
  hashtags: string[];
};

export type SupportingContent = {
  byPlatform: Partial<Record<string, SupportingContentItem>>;
  provider: string;
  model: string;
};

/** Placeholders for later phases — kept on the interface per SDD §7.1. */
export type ScriptDoc = {
  title?: string;
  hook: string;
  body: string;
  cta: string;
};

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export type Transcript = {
  segments: TranscriptSegment[];
};

/** Input for Phase 6 STT (SDD §7.2). */
export type TranscribeInput = {
  /** Path to audio/video file (Whisper). */
  filePath?: string;
  /** In-memory audio (Whisper). */
  audio?: { data: Uint8Array | Buffer; mimeType: string; filename?: string };
  /**
   * Mock / fallback source text — turned into timestamped word segments
   * when no audio is available (demos + tests).
   */
  hintText?: string;
  /** BCP-47 / ISO language hint (e.g. `en`). */
  language?: string;
};

export type Alignment = {
  scriptExcerpt: string;
  startMs: number;
  endMs: number;
  /** 0–1 fuzzy / model confidence. */
  confidence: number;
};

export type ClipIdea = {
  startMs: number;
  endMs: number;
  score: number;
  titleSuggestion: string;
  rationale: string;
};

export type TimelineContext = {
  script: ScriptDoc;
  alignments?: Alignment[];
  clipIdeas?: ClipIdea[];
};

/** Opaque until Phase 8 timeline schema lands. */
export type EditTimeline = {
  version: 1;
  clips: Array<{ startMs: number; endMs: number; label?: string }>;
  notes: string;
};

export type AiProviderName = 'mock' | 'openai' | 'gemini';

export interface AiProvider {
  readonly name: AiProviderName;

  generateScript(input: ScriptGenInput): Promise<ScriptGenResult>;
  generateHooks(script: string, n: number): Promise<string[]>;
  generateSupporting(
    script: string,
    platforms: Platform[],
  ): Promise<SupportingContent>;

  /** Phase 6 — STT → normalized TranscriptSegment[]. */
  transcribe(input: TranscribeInput): Promise<Transcript>;

  /** Phase 6 — fuzzy (or better) script↔transcript alignment. */
  alignScriptToTranscript(
    script: ScriptDoc,
    segments: TranscriptSegment[],
  ): Promise<Alignment[]>;

  /** Phase 7 — rank 15–60s clip windows (title + score 0–1). */
  scoreClipWindows(
    transcript: Transcript,
    script: ScriptDoc,
  ): Promise<ClipIdea[]>;

  /** Phase 8 — stub until then. */
  proposeTimeline(ctx: TimelineContext): Promise<EditTimeline>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'missing_api_key'
      | 'http_error'
      | 'parse_error'
      | 'not_implemented'
      | 'invalid_config',
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
