import { z } from 'zod';

/** Project lifecycle stages — mirrors Prisma `ProjectStage` / SDD §4.2. */
export const projectStageSchema = z.enum([
  'IDEA',
  'SCRIPT',
  'RECORDED',
  'EDITING',
  'CLIPS',
  'ADAPTED',
  'READY',
  'PUBLISHED',
]);
export type ProjectStage = z.infer<typeof projectStageSchema>;

export const PROJECT_STAGES = projectStageSchema.options;

/** Target publish platforms — mirrors Prisma `Platform` / SDD §4.2. */
export const platformSchema = z.enum([
  'YOUTUBE',
  'YOUTUBE_SHORTS',
  'INSTAGRAM_REELS',
  'TIKTOK',
  'LINKEDIN',
]);
export type Platform = z.infer<typeof platformSchema>;

export const PLATFORMS = platformSchema.options;

export const projectSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().nullable(),
  stage: projectStageSchema,
  targetPlatforms: z.array(platformSchema),
  assetIds: z.array(z.string().uuid()),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const createProjectRequestSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  targetPlatforms: z.array(platformSchema).default([]),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    targetPlatforms: z.array(platformSchema).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.targetPlatforms !== undefined,
    {
      message:
        'At least one of title, description, or targetPlatforms is required',
    },
  );
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

export const projectListQuerySchema = z.object({
  stage: projectStageSchema.optional(),
  q: z.string().max(200).optional(),
});
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export const projectListResponseSchema = z.object({
  items: z.array(projectSchema),
});
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

export const transitionStageRequestSchema = z.object({
  stage: projectStageSchema,
});
export type TransitionStageRequest = z.infer<
  typeof transitionStageRequestSchema
>;

export const attachAssetsRequestSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(100),
});
export type AttachAssetsRequest = z.infer<typeof attachAssetsRequestSchema>;

/** Same body shape for detach. */
export const detachAssetsRequestSchema = attachAssetsRequestSchema;
export type DetachAssetsRequest = z.infer<typeof detachAssetsRequestSchema>;

export const stageEventSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  fromStage: projectStageSchema.nullable(),
  toStage: projectStageSchema,
  createdAt: z.string().datetime(),
});
export type StageEventDto = z.infer<typeof stageEventSchema>;

export const stageHistoryResponseSchema = z.object({
  items: z.array(stageEventSchema),
});
export type StageHistoryResponse = z.infer<typeof stageHistoryResponseSchema>;
