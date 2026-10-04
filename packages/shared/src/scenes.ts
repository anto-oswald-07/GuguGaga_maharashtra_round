import { z } from 'zod';

/** Beat role inside a detailed production script. */
export const scriptBeatTypeSchema = z.enum([
  'HOOK',
  'POINT',
  'BROLL',
  'CTA',
  'TRANSITION',
]);
export type ScriptBeatType = z.infer<typeof scriptBeatTypeSchema>;

export const SCRIPT_BEAT_TYPES = scriptBeatTypeSchema.options;

/** How a scene slot was filled. */
export const sceneFulfillmentModeSchema = z.enum([
  'EMPTY',
  'UPLOAD',
  'AI_GENERATED',
  'TRIMMED',
]);
export type SceneFulfillmentMode = z.infer<typeof sceneFulfillmentModeSchema>;

export const SCENE_FULFILLMENT_MODES = sceneFulfillmentModeSchema.options;

export const sceneFulfillmentSchema = z.object({
  mode: sceneFulfillmentModeSchema.default('EMPTY'),
  assetId: z.string().uuid().optional(),
  clipCandidateId: z.string().uuid().optional(),
  transcriptId: z.string().uuid().optional(),
  /** AI director opinion for this scene vs brief. */
  opinion: z.string().max(4000).optional(),
  /** 0–1 match of footage/transcript to spokenText / visualBrief. */
  matchConfidence: z.number().min(0).max(1).optional(),
});
export type SceneFulfillment = z.infer<typeof sceneFulfillmentSchema>;

/**
 * One production beat inside ScriptVersion.content.scenes[].
 * Stable `id` lets Footage / Clips / Editor refer to the same slot across versions.
 */
export const scriptSceneSchema = z.object({
  id: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  spokenText: z.string().max(4000),
  beatType: scriptBeatTypeSchema,
  targetDurationMs: z.number().int().positive().max(600_000),
  visualBrief: z.string().max(2000),
  fulfillment: sceneFulfillmentSchema.default({ mode: 'EMPTY' }),
});
export type ScriptScene = z.infer<typeof scriptSceneSchema>;

/** Body for attaching an uploaded asset to a scene slot. */
export const fulfillSceneRequestSchema = z.object({
  scriptId: z.string().uuid(),
  sceneId: z.string().uuid(),
  assetId: z.string().uuid(),
});
export type FulfillSceneRequest = z.infer<typeof fulfillSceneRequestSchema>;

/** Body for enqueueing AI placeholder generation for one scene. */
export const generateSceneRequestSchema = z.object({
  scriptId: z.string().uuid(),
  sceneId: z.string().uuid(),
  prompt: z.string().max(4000).optional(),
});
export type GenerateSceneRequest = z.infer<typeof generateSceneRequestSchema>;

/** Body for REVIEW_FOOTAGE / MATCH_SCENES over a script's scenes. */
export const scenePipelineRequestSchema = z.object({
  scriptId: z.string().uuid(),
  /** Optional: limit to one scene. */
  sceneId: z.string().uuid().optional(),
});
export type ScenePipelineRequest = z.infer<typeof scenePipelineRequestSchema>;

export type ClipPromptStyle =
  | 'cinematic'
  | 'tech'
  | 'studio'
  | 'documentary'
  | 'stylized';

export type ClipPromptCamera =
  | 'push-in'
  | 'orbit'
  | 'handheld'
  | 'static'
  | 'dynamic';

export type ClipPromptOptions = {
  title: string;
  spokenText?: string;
  beatType?: string;
  visualBrief?: string;
  targetDurationMs?: number;
  scriptTopic?: string | null;
  style?: ClipPromptStyle;
  camera?: ClipPromptCamera;
};

/**
 * Builds a rich, production-ready video generation prompt tailored for modern
 * AI video generators (Runway Gen-3, Kling, Sora, Pika, Luma Dream Machine).
 */
export function buildClipPrompt(opts: ClipPromptOptions): string {
  const durationSec = Math.max(
    1,
    Math.min(30, Math.round((opts.targetDurationMs ?? 3000) / 1000)),
  );
  const beat = (opts.beatType || 'POINT').toUpperCase();
  const style: ClipPromptStyle = opts.style || 'cinematic';
  const camera: ClipPromptCamera =
    opts.camera ||
    (beat === 'HOOK' ? 'push-in' : beat === 'CTA' ? 'orbit' : 'dynamic');

  let subjectLead = '';
  if (beat === 'HOOK') {
    subjectLead =
      'High-impact visual hook. Dynamic close-up or striking visual metaphor';
  } else if (beat === 'CTA') {
    subjectLead =
      'High-energy closing payoff. Clean framing with negative space for bold caption overlay';
  } else if (beat === 'TRANSITION') {
    subjectLead = 'Seamless kinetic transition cutaway';
  } else {
    subjectLead = 'Engaging B-roll sequence. Crisp visual storytelling';
  }

  const cleanSpoken = (opts.spokenText || '').trim().replace(/["\n]+/g, ' ');
  const cleanBrief = (opts.visualBrief || '').trim().replace(/["\n]+/g, ' ');
  const cleanTopic = (opts.scriptTopic || '').trim().replace(/["\n]+/g, ' ');

  let visualDescription = '';
  if (
    cleanBrief &&
    !cleanBrief.toLowerCase().includes('illustrating point') &&
    !cleanBrief.toLowerCase().includes('talking-head open')
  ) {
    visualDescription = cleanBrief;
  } else if (cleanSpoken) {
    visualDescription = `illustrating the concept: "${cleanSpoken.slice(0, 160)}"`;
  } else {
    visualDescription = `illustrating ${opts.title}${cleanTopic ? ` in the context of ${cleanTopic}` : ''}`;
  }

  const cameraDescriptions: Record<ClipPromptCamera, string> = {
    'push-in':
      'slow push-in tracking shot, shallow depth of field (f/1.8), smooth cinematic gimbal movement',
    orbit:
      'subtle 360-degree orbit around the subject, dynamic parallax effect',
    handheld:
      'handheld documentary realism, natural subtle sway, authentic camera movement',
    static:
      'locked-off tripod shot, crisp symmetrical framing, focused depth of field',
    dynamic:
      'kinetic camera motion, fluid pan with rack focus, modern commercial pacing',
  };
  const cameraMotion = cameraDescriptions[camera] ?? cameraDescriptions.dynamic;

  const styleDescriptions: Record<ClipPromptStyle, string> = {
    cinematic:
      '35mm anamorphic lens, cinematic volumetric lighting, rich color grade, dramatic contrast, photorealistic 8K UHD',
    tech:
      'modern creator tech studio, neon edge rim lights, sleek dark aesthetics, crisp clean reflections, ultra-detailed',
    studio:
      'bright minimalist studio, soft diffused warm key light, neutral pastel palette, pristine commercial aesthetic',
    documentary:
      'natural daylight illumination, candid realistic setting, 24fps film grain, organic colors, authentic lifestyle feel',
    stylized:
      'vibrant stylized 3D aesthetics, bold saturated lighting, contemporary graphic depth, polished render',
  };
  const aesthetic = styleDescriptions[style] ?? styleDescriptions.cinematic;

  const specs = `vertical 9:16 aspect ratio, mobile video, ~${durationSec}s duration, photorealistic quality`;

  return `${subjectLead} ${visualDescription}. ${cameraMotion}, ${aesthetic}. ${specs}.`;
}
