import type { Platform, ScriptScene } from '@creatorai/shared';

/** Lightweight asset catalog for AI timeline / edit suggestions. */
export type TimelineAssetSummary = {
  id: string;
  type: 'VIDEO' | 'IMAGE' | 'AUDIO' | string;
  name: string;
  description?: string | null;
  tags?: string[];
  /** From asset.metadata.durationMs / durationSec when known. */
  durationMs?: number | null;
};

/** Input for Phase 5 script generation (SDD §7.1 / FR script gen). */
export type ScriptGenInput = {
  topic: string;
  audience: string;
  tone: string;
  /** Primary target platform (enum name or free text for mock). */
  platform: Platform | string;
  /** Optional refine instruction (UI “Refine”). */
  refineInstruction?: string;
  /** Optional project media catalog so scripts match available footage/stills/audio. */
  assets?: TimelineAssetSummary[];
};

/** Structured script returned by providers. */
export type ScriptGenResult = {
  title: string;
  hook: string;
  body: string;
  cta: string;
  /** Production beats for Footage fulfillment (optional; derived if missing). */
  scenes?: ScriptScene[];
  /** Convenience join of hook + body + CTA for editors. */
  fullText: string;
  /** Which provider produced this (mock|openai|gemini|grok|openrouter|groq|mistral|…). */
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
  scenes?: ScriptScene[];
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
  /**
   * Real media duration from asset metadata. When set, mock STT fits
   * segment timings into this window so mapping matches the video length.
   */
  durationMs?: number;
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

/** Accepted clip window used when proposing a timeline (ClipCandidate / ClipIdea). */
export type TimelineAcceptedClip = {
  startMs: number;
  endMs: number;
  titleSuggestion?: string;
  label?: string;
  assetId?: string;
  id?: string;
};

export type TimelineContext = {
  script: ScriptDoc;
  /** Script↔footage mappings (captions / soft timing cues). */
  alignments?: Alignment[];
  /** Ranked clip ideas (used when acceptedClips omitted). */
  clipIdeas?: ClipIdea[];
  /** Preferred: user-accepted ClipCandidate windows. */
  acceptedClips?: TimelineAcceptedClip[];
  /** Default footage assetId for video clips missing their own. */
  sourceAssetId?: string;
  /**
   * Project media attached for analysis (images, videos, audio beds).
   * Used by Grok (and optionally others) to suggest holds / order / mix.
   */
  assets?: TimelineAssetSummary[];
  /** Optional audio beds / clips to propose on the audio track. */
  audioClips?: TimelineAudioClip[];
};

export type TimelineTextStyle = {
  position?: 'top' | 'center' | 'bottom';
  fontSize?: number;
};

export type TimelineVideoClip = {
  id: string;
  assetId: string;
  srcStartMs: number;
  srcEndMs: number;
  timelineStartMs: number;
  label?: string;
  /** Images hold stills for (srcEndMs - srcStartMs). */
  mediaKind?: 'video' | 'image';
};

export type TimelineAudioClip = {
  id: string;
  assetId: string;
  srcStartMs: number;
  srcEndMs: number;
  timelineStartMs: number;
  label?: string;
};

export type TimelineTextItem = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  style?: TimelineTextStyle;
};

export type TimelineCaptionItem = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
};

export type TimelineVideoTrack = {
  id: string;
  type: 'video';
  clips: TimelineVideoClip[];
};

export type TimelineAudioTrack = {
  id: string;
  type: 'audio';
  clips: TimelineAudioClip[];
};

export type TimelineTextTrack = {
  id: string;
  type: 'text';
  items: TimelineTextItem[];
};

export type TimelineCaptionsTrack = {
  id: string;
  type: 'captions';
  items: TimelineCaptionItem[];
};

export type TimelineTrack =
  | TimelineVideoTrack
  | TimelineAudioTrack
  | TimelineTextTrack
  | TimelineCaptionsTrack;

/**
 * Edit timeline JSON (SDD §4.3 / docs/timeline-notes.md).
 * Full Zod validation lands in `@creatorai/timeline-schema` (Phase 8 D).
 */
export type EditTimeline = {
  schemaVersion: '1.0';
  fps: number;
  durationMs: number;
  tracks: TimelineTrack[];
  transitions: unknown[];
  meta: {
    generatedBy: 'ai' | 'user' | 'mock';
    prompt?: string;
    notes?: string;
  };
};

export type AiProviderName =
  | 'mock'
  | 'openai'
  | 'gemini'
  | 'grok'
  | 'openrouter'
  | 'groq'
  | 'mistral'
  | 'auto';

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

  /** Phase 8 — build EditTimeline JSON (clips + hook overlay 0–3s). */
  proposeTimeline(ctx: TimelineContext): Promise<EditTimeline>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'missing_api_key'
      | 'http_error'
      | 'rate_limited'
      | 'quota_exceeded'
      | 'parse_error'
      | 'not_implemented'
      | 'invalid_config',
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
