import { z } from 'zod';

/** Mirrors Prisma `JobType` / SDD §4.2 (+ Phase 5 hooks/supporting). */
export const jobTypeSchema = z.enum([
  'TRANSCRIBE',
  'ALIGN_SCRIPT',
  'SCORE_CLIPS',
  'RENDER_CLIP',
  'RENDER_TIMELINE',
  'ADAPT_PLATFORM',
  'GENERATE_SCRIPT',
  'GENERATE_HOOKS',
  'GENERATE_SUPPORTING',
]);
export type JobType = z.infer<typeof jobTypeSchema>;

export const JOB_TYPES = jobTypeSchema.options;

export const jobStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const JOB_STATUSES = jobStatusSchema.options;

export const jobSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  progress: z.number().int().min(0).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type JobDto = z.infer<typeof jobSchema>;

export const jobListQuerySchema = z.object({
  status: jobStatusSchema.optional(),
  type: jobTypeSchema.optional(),
  projectId: z.string().uuid().optional(),
});
export type JobListQuery = z.infer<typeof jobListQuerySchema>;

export const jobListResponseSchema = z.object({
  items: z.array(jobSchema),
});
export type JobListResponse = z.infer<typeof jobListResponseSchema>;

/**
 * Optional body for `POST /jobs/:id/mock-complete`.
 * When omitted, API builds deterministic mock output from job input.
 */
export const mockCompleteJobRequestSchema = z
  .object({
    fail: z.boolean().optional(),
    error: z.string().max(2000).optional(),
    output: z.record(z.unknown()).optional(),
  })
  .default({});
export type MockCompleteJobRequest = z.infer<
  typeof mockCompleteJobRequestSchema
>;
