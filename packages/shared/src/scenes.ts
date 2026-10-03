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
});
export type GenerateSceneRequest = z.infer<typeof generateSceneRequestSchema>;

/** Body for REVIEW_FOOTAGE / MATCH_SCENES over a script's scenes. */
export const scenePipelineRequestSchema = z.object({
  scriptId: z.string().uuid(),
  /** Optional: limit to one scene. */
  sceneId: z.string().uuid().optional(),
});
export type ScenePipelineRequest = z.infer<typeof scenePipelineRequestSchema>;
