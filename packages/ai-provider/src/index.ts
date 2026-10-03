export type {
  AiProvider,
  AiProviderName,
  Alignment,
  ClipIdea,
  EditTimeline,
  ScriptDoc,
  ScriptGenInput,
  ScriptGenResult,
  SupportingContent,
  SupportingContentItem,
  TimelineContext,
  Transcript,
  TranscriptSegment,
  TranscribeInput,
} from './types';
export { AiProviderError } from './types';
export { MockAiProvider } from './mock/MockAiProvider';
export { OpenAiProvider } from './openai/OpenAiProvider';
export { GeminiProvider } from './gemini/GeminiProvider';
export { createAiProvider, type CreateAiProviderOptions } from './createProvider';
export {
  fuzzyAlignScriptToTranscript,
  fuzzyScore,
  jaccardTokens,
  normalizeText,
  scriptToExcerpts,
  tokenize,
} from './align/fuzzyAlign';
export { mockTranscribeFromText } from './stt/mockTranscribe';
export {
  CLIP_MAX_MS,
  CLIP_MIN_MS,
  CLIP_TARGET_MS,
  buildCandidateWindows,
  scoreClipWindowsFromTranscript,
  stableDemoClipIdeas,
  windowText,
} from './clips/scoreClipWindows';
export {
  DEMO_SOURCE_ASSET_ID,
  HOOK_OVERLAY_END_MS,
  HOOK_OVERLAY_START_MS,
  assertValidTimelineShape,
  proposeTimelineFromContext,
  stableDemoAcceptedClips,
  stableDemoTimeline,
  validateTimeline,
} from './timeline/proposeTimeline';
export {
  PLATFORM_COPY_LIMITS,
  buildPlatformCopyItem,
  clampCopy,
  clampSupportingItem,
  extractTopicBit,
  generatePlatformCopyFromScript,
  limitsForPlatform,
  normalizeHashtag,
} from './platform/generatePlatformCopy';
export type { PlatformCopyLimits } from './platform/copyLimits';
export type {
  TimelineAcceptedClip,
  TimelineCaptionItem,
  TimelineTextItem,
  TimelineTextStyle,
  TimelineTrack,
  TimelineVideoClip,
} from './types';
