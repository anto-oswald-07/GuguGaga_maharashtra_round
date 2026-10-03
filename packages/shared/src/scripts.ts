import { z } from 'zod';
import { platformSchema } from './projects';

/** How a script version was produced. */
export const scriptSourceSchema = z.enum(['USER', 'AI', 'REFINE']);
export type ScriptSource = z.infer<typeof scriptSourceSchema>;

export const SCRIPT_SOURCES = scriptSourceSchema.options;

/**
 * Structured script body (hook / body / CTA).
 * Cyrus Phase 5 D may mirror this in `schemas/scriptSchema.ts` — keep fields aligned at Integration.
 */
export const scriptContentSchema = z.object({
  hook: z.string().min(1).max(2000),
  body: z.string().min(1).max(20000),
  cta: z.string().min(1).max(2000),
  title: z.string().max(500).optional(),
  rawText: z.string().max(50000).optional(),
});
export type ScriptContent = z.infer<typeof scriptContentSchema>;

export const scriptVersionSchema = z.object({
  id: z.string().uuid(),
  scriptDocumentId: z.string().uuid(),
  version: z.number().int().positive(),
  content: scriptContentSchema,
  source: scriptSourceSchema,
  createdAt: z.string().datetime(),
});
export type ScriptVersionDto = z.infer<typeof scriptVersionSchema>;

export const scriptDocumentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().nullable(),
  latestVersion: scriptVersionSchema.nullable(),
  versionCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScriptDocumentDto = z.infer<typeof scriptDocumentSchema>;

export const scriptDocumentDetailSchema = scriptDocumentSchema.extend({
  versions: z.array(scriptVersionSchema),
});
export type ScriptDocumentDetailDto = z.infer<
  typeof scriptDocumentDetailSchema
>;

export const scriptListResponseSchema = z.object({
  items: z.array(scriptDocumentSchema),
});
export type ScriptListResponse = z.infer<typeof scriptListResponseSchema>;

export const createScriptRequestSchema = z.object({
  title: z.string().max(255).nullable().optional(),
  content: scriptContentSchema,
  source: scriptSourceSchema.default('USER'),
});
export type CreateScriptRequest = z.infer<typeof createScriptRequestSchema>;

export const createScriptVersionRequestSchema = z.object({
  content: scriptContentSchema,
  source: scriptSourceSchema.default('USER'),
});
export type CreateScriptVersionRequest = z.infer<
  typeof createScriptVersionRequestSchema
>;

/** Body for `POST /projects/:id/scripts/generate`. */
export const generateScriptRequestSchema = z.object({
  topic: z.string().min(1).max(500),
  audience: z.string().min(1).max(500),
  tone: z.string().min(1).max(200),
  platform: platformSchema,
  /** When set, refine an existing script instead of creating from scratch. */
  scriptId: z.string().uuid().optional(),
  refineInstruction: z.string().max(2000).optional(),
  title: z.string().max(255).optional(),
});
export type GenerateScriptRequest = z.infer<typeof generateScriptRequestSchema>;

export const generateHooksRequestSchema = z.object({
  count: z.number().int().min(1).max(10).default(5),
});
export type GenerateHooksRequest = z.infer<typeof generateHooksRequestSchema>;

export const generateSupportingRequestSchema = z.object({
  platforms: z.array(platformSchema).min(1).max(10),
});
export type GenerateSupportingRequest = z.infer<
  typeof generateSupportingRequestSchema
>;

/** Body for `POST /scripts/:id/refine`. */
export const refineScriptRequestSchema = z.object({
  instruction: z.string().min(1).max(2000),
});
export type RefineScriptRequest = z.infer<typeof refineScriptRequestSchema>;

/** Response when a generate endpoint enqueues work. */
export const enqueueJobResponseSchema = z.object({
  jobId: z.string().uuid(),
});
export type EnqueueJobResponse = z.infer<typeof enqueueJobResponseSchema>;
