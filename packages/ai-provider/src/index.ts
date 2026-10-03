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
  TimelineAssetSummary,
  TimelineAudioClip,
  TimelineContext,
  Transcript,
  TranscriptSegment,
  TranscribeInput,
} from './types';
export { AiProviderError } from './types';
export {
  MockAiProvider,
  type MockAiProviderOptions,
} from './mock/MockAiProvider';
export {
  DEFAULT_AI_MOCK_SEED,
  demoHash,
  resolveMockSeed,
} from './mock/demoSeed';
export { OpenAiProvider } from './openai/OpenAiProvider';
export { GeminiProvider } from './gemini/GeminiProvider';
export { GrokProvider } from './grok/GrokProvider';
export { GroqProvider } from './groq/GroqProvider';
export { OpenRouterProvider } from './openrouter/OpenRouterProvider';
export { MistralProvider } from './mistral/MistralProvider';
export { FallbackAiProvider } from './fallback/FallbackAiProvider';
export { createAiProvider, type CreateAiProviderOptions } from './createProvider';
export { httpErrorFromResponse, isFallbackWorthy } from './httpErrors';
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
  buildScenesFromScript,
  ensureScriptScenes,
  type SceneScriptParts,
} from './scripts/buildScenes';
export {
  matchScenesToTranscript,
  reviewScenesAgainstTranscript,
  sceneMatchesToClipIdeas,
  type SceneMatchResult,
  type SceneReviewResult,
} from './scenes/reviewAndMatch';
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
  TimelineAudioTrack,
  TimelineCaptionItem,
  TimelineTextItem,
  TimelineTextStyle,
  TimelineTrack,
  TimelineVideoClip,
} from './types';
