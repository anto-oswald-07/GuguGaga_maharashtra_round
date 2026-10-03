import { z } from 'zod';

/**
 * UI flags mappings with confidence below this (FR-STV-006).
 * Align with Mapping UI "low confidence" highlight.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.55;

export const transcriptSegmentSchema = z.object({
  id: z.string().uuid(),
  transcriptId: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
});
export type TranscriptSegmentDto = z.infer<typeof transcriptSegmentSchema>;

export const transcriptSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  assetId: z.string().uuid(),
  language: z.string(),
  segmentCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TranscriptDto = z.infer<typeof transcriptSchema>;

export const transcriptDetailSchema = transcriptSchema.extend({
  segments: z.array(transcriptSegmentSchema),
});
export type TranscriptDetailDto = z.infer<typeof transcriptDetailSchema>;

export const transcriptListResponseSchema = z.object({
  items: z.array(transcriptDetailSchema),
});
export type TranscriptListResponse = z.infer<
  typeof transcriptListResponseSchema
>;

export const scriptFootageMapSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  transcriptId: z.string().uuid().nullable(),
  scriptDocumentId: z.string().uuid().nullable(),
  scriptRef: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['AI', 'USER']),
  lowConfidence: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScriptFootageMapDto = z.infer<typeof scriptFootageMapSchema>;

export const mappingListResponseSchema = z.object({
  items: z.array(scriptFootageMapSchema),
  lowConfidenceThreshold: z.number(),
});
export type MappingListResponse = z.infer<typeof mappingListResponseSchema>;

/** Body for `POST /projects/:id/transcribe`. */
export const transcribeRequestSchema = z.object({
  assetId: z.string().uuid(),
  language: z.string().min(2).max(16).optional(),
});
export type TranscribeRequest = z.infer<typeof transcribeRequestSchema>;

/** Body for `POST /projects/:id/align`. */
export const alignScriptRequestSchema = z.object({
  scriptId: z.string().uuid(),
  /** When omitted, API uses the latest transcript for the project. */
  transcriptId: z.string().uuid().optional(),
});
export type AlignScriptRequest = z.infer<typeof alignScriptRequestSchema>;

/** Body for `PATCH /mappings/:id` (manual correction). */
export const patchMappingRequestSchema = z
  .object({
    scriptRef: z.string().min(1).max(2000).optional(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().nonnegative().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine(
    (b) =>
      b.scriptRef !== undefined ||
      b.startMs !== undefined ||
      b.endMs !== undefined ||
      b.confidence !== undefined,
    { message: 'At least one field is required' },
  )
  .refine(
    (b) =>
      b.startMs === undefined ||
      b.endMs === undefined ||
      b.endMs >= b.startMs,
    { message: 'endMs must be >= startMs' },
  );
export type PatchMappingRequest = z.infer<typeof patchMappingRequestSchema>;
