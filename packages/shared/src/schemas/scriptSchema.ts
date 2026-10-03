/**
 * Script / hooks / supporting-content Zod schemas (Phase 5 — Dev D).
 * Used by API, worker AI consumers, and UI to validate GeneratedScript shapes.
 * Prompt templates: docs/ai/prompts/**
 */

import { z } from 'zod';
import { platformSchema } from '../projects';
import { scriptSceneSchema } from '../scenes';

const nonEmptyText = z.string().trim().min(1);

/** Input for AiProvider.generateScript (SDD §7.1). */
export const scriptGenInputSchema = z.object({
  topic: nonEmptyText.max(500),
  audience: nonEmptyText.max(500),
  tone: nonEmptyText.max(200),
  platform: platformSchema,
});
export type ScriptGenInput = z.infer<typeof scriptGenInputSchema>;

/** Provenance echoed on generated scripts. */
export const generatedScriptMetaSchema = z.object({
  topic: nonEmptyText.max(500),
  audience: nonEmptyText.max(500),
  tone: nonEmptyText.max(200),
  /** Prefer Platform enum; allow plain string if provider returns a free-form label. */
  platform: z.union([platformSchema, nonEmptyText.max(64)]),
});
export type GeneratedScriptMeta = z.infer<typeof generatedScriptMetaSchema>;

/**
 * Structured script output — Hook / Body / CTA (+ optional production scenes).
 * This is the primary `GeneratedScript` contract for Phase 5+.
 */
export const generatedScriptSchema = z.object({
  hook: nonEmptyText.max(2000),
  body: nonEmptyText.max(20000),
  cta: nonEmptyText.max(2000),
  scenes: z.array(scriptSceneSchema).max(40).optional(),
  meta: generatedScriptMetaSchema.optional(),
});
export type GeneratedScript = z.infer<typeof generatedScriptSchema>;

/** Alias matching AiProvider naming in SDD (`ScriptGenResult`). */
export const scriptGenResultSchema = generatedScriptSchema;
export type ScriptGenResult = GeneratedScript;

/** Output for AiProvider.generateHooks → wrapped for stable JSON parsing. */
export const generatedHooksSchema = z.object({
  hooks: z.array(nonEmptyText.max(500)).min(1).max(20),
});
export type GeneratedHooks = z.infer<typeof generatedHooksSchema>;

/** Output for AiProvider.generateSupporting (titles/captions/hashtags/description). */
export const supportingContentSchema = z.object({
  titles: z.array(nonEmptyText.max(200)).min(1).max(10),
  captions: z.array(nonEmptyText.max(2200)).min(1).max(10),
  hashtags: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[^#\s]+$/, 'hashtags must not include # or spaces'),
    )
    .min(1)
    .max(30),
  description: nonEmptyText.max(5000),
});
export type SupportingContent = z.infer<typeof supportingContentSchema>;

export function assertGeneratedScript(data: unknown): GeneratedScript {
  return generatedScriptSchema.parse(data);
}

export function assertGeneratedHooks(data: unknown): GeneratedHooks {
  return generatedHooksSchema.parse(data);
}

export function assertSupportingContent(data: unknown): SupportingContent {
  return supportingContentSchema.parse(data);
}
