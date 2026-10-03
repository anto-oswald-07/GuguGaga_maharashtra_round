import { z } from 'zod';
import { platformSchema } from './projects';
import { projectStageSchema } from './workflow/stages';

/** Production + engagement overview (FR-INT-001 / FR-INT-002 / FR-INT-004). */
export const insightsOverviewSchema = z.object({
  counts: z.object({
    projects: z.number().int().nonnegative(),
    assets: z.number().int().nonnegative(),
    clips: z.number().int().nonnegative(),
    packs: z.number().int().nonnegative(),
    jobsRunning: z.number().int().nonnegative(),
    jobsQueued: z.number().int().nonnegative(),
    jobsFailed: z.number().int().nonnegative(),
    jobsSucceeded: z.number().int().nonnegative(),
  }),
  stageDistribution: z.array(
    z.object({
      stage: projectStageSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  clipsPerProject: z.array(
    z.object({
      projectId: z.string().uuid(),
      title: z.string(),
      clipCount: z.number().int().nonnegative(),
    }),
  ),
  platformMix: z.array(
    z.object({
      platform: platformSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  /** Average accepted/rendered clip duration in ms; null when no clips. */
  avgClipLengthMs: z.number().nonnegative().nullable(),
  /** Average ms spent in each stage (from StageEvent deltas); null when insufficient events. */
  avgTimeInStageMs: z.array(
    z.object({
      stage: projectStageSchema,
      avgMs: z.number().nonnegative().nullable(),
    }),
  ),
  engagementTotals: z.object({
    views: z.number().int().nonnegative(),
    likes: z.number().int().nonnegative(),
    entries: z.number().int().nonnegative(),
  }),
});
export type InsightsOverview = z.infer<typeof insightsOverviewSchema>;

/** Body for `POST /insights/engagement` (FR-INT-003). */
export const postEngagementRequestSchema = z.object({
  projectId: z.string().uuid(),
  /** Optional pack this engagement is about. */
  packId: z.string().uuid().optional(),
  /** Defaults to pack.platform when packId is set. */
  platform: platformSchema.optional(),
  views: z.number().int().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
  notes: z.string().max(2000).nullable().optional(),
});
export type PostEngagementRequest = z.infer<typeof postEngagementRequestSchema>;

export const insightMetricSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  packId: z.string().uuid().nullable(),
  platform: platformSchema.nullable(),
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type InsightMetricDto = z.infer<typeof insightMetricSchema>;
