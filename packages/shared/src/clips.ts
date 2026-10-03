import { z } from 'zod';

/** Clip candidate lifecycle (FR-CLP-003 / FR-CLP-004). */
export const clipCandidateStatusSchema = z.enum([
  'proposed',
  'accepted',
  'rejected',
  'rendered',
]);
export type ClipCandidateStatus = z.infer<typeof clipCandidateStatusSchema>;

export const CLIP_CANDIDATE_STATUSES = clipCandidateStatusSchema.options;

export const clipCandidateSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceAssetId: z.string().uuid(),
  transcriptId: z.string().uuid().nullable(),
  scriptDocumentId: z.string().uuid().nullable(),
  title: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  /** 0–1 score / confidence from scorer. */
  score: z.number().min(0).max(1),
  rationale: z.string().nullable(),
  status: clipCandidateStatusSchema,
  renderedAssetId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ClipCandidateDto = z.infer<typeof clipCandidateSchema>;

export const clipCandidateListResponseSchema = z.object({
  items: z.array(clipCandidateSchema),
});
export type ClipCandidateListResponse = z.infer<
  typeof clipCandidateListResponseSchema
>;

/** Body for `POST /projects/:id/clips/propose`. */
export const proposeClipsRequestSchema = z.object({
  /** When omitted, API uses the latest script document for the project. */
  scriptId: z.string().uuid().optional(),
  /** When omitted, API uses the latest transcript for the project. */
  transcriptId: z.string().uuid().optional(),
  /**
   * Long-form footage to cut from. When omitted, uses transcript.assetId.
   * Must be attached to the project.
   */
  sourceAssetId: z.string().uuid().optional(),
});
export type ProposeClipsRequest = z.infer<typeof proposeClipsRequestSchema>;

/**
 * Body for `PATCH /clips/candidates/:id`.
 * Status may be proposed/accepted/rejected — `rendered` is set by RENDER_CLIP.
 */
export const patchClipCandidateRequestSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().nonnegative().optional(),
    status: z.enum(['proposed', 'accepted', 'rejected']).optional(),
  })
  .refine(
    (b) =>
      b.title !== undefined ||
      b.startMs !== undefined ||
      b.endMs !== undefined ||
      b.status !== undefined,
    { message: 'At least one field is required' },
  )
  .refine(
    (b) =>
      b.startMs === undefined ||
      b.endMs === undefined ||
      b.endMs > b.startMs,
    { message: 'endMs must be > startMs' },
  );
export type PatchClipCandidateRequest = z.infer<
  typeof patchClipCandidateRequestSchema
>;
