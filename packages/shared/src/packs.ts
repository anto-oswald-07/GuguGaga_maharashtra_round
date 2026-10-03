import { z } from 'zod';
import { platformSchema } from './projects';

/** Aspect ratios for platform packs (SDD §4.2 / FR-PLT-001). */
export const aspectRatioSchema = z.enum(['R_16_9', 'R_9_16', 'R_1_1']);
export type AspectRatio = z.infer<typeof aspectRatioSchema>;

export const ASPECT_RATIOS = aspectRatioSchema.options;

/** Publish tracking per pack (FR-PLT-006). */
export const packStatusSchema = z.enum(['draft', 'ready', 'published']);
export type PackStatus = z.infer<typeof packStatusSchema>;

export const PACK_STATUSES = packStatusSchema.options;

/** Default aspect ratio per platform (MVP mapping). */
export const PLATFORM_DEFAULT_ASPECT: Record<
  z.infer<typeof platformSchema>,
  AspectRatio
> = {
  YOUTUBE: 'R_16_9',
  YOUTUBE_SHORTS: 'R_9_16',
  INSTAGRAM_REELS: 'R_9_16',
  TIKTOK: 'R_9_16',
  LINKEDIN: 'R_1_1',
};

export const platformPackSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  platform: platformSchema,
  aspectRatio: aspectRatioSchema,
  status: packStatusSchema,
  title: z.string().nullable(),
  caption: z.string().nullable(),
  hashtags: z.array(z.string()),
  outputAssetId: z.string().uuid().nullable(),
  sourceAssetId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PlatformPackDto = z.infer<typeof platformPackSchema>;

export const packListResponseSchema = z.object({
  items: z.array(platformPackSchema),
});
export type PackListResponse = z.infer<typeof packListResponseSchema>;

/** Body for `POST /projects/:id/packs/generate`. */
export const generatePacksRequestSchema = z.object({
  /**
   * Platforms to adapt. When omitted, uses the project's `targetPlatforms`
   * (must be non-empty).
   */
  platforms: z.array(platformSchema).min(1).max(5).optional(),
  /**
   * Source video to adapt. When omitted, prefers timeline preview, else
   * latest rendered clip, else latest project VIDEO asset.
   */
  sourceAssetId: z.string().uuid().optional(),
  /** Optional timeline whose previewAssetId is preferred as source. */
  timelineId: z.string().uuid().optional(),
});
export type GeneratePacksRequest = z.infer<typeof generatePacksRequestSchema>;

/**
 * Body for `PATCH /packs/:id/status` (SDD §5.8).
 * Status required; copy fields optional so UI can edit title/caption/hashtags
 * in the same save.
 */
export const patchPackStatusRequestSchema = z
  .object({
    status: packStatusSchema,
    title: z.string().min(1).max(200).nullable().optional(),
    caption: z.string().min(1).max(2200).nullable().optional(),
    hashtags: z
      .array(z.string().trim().min(1).max(100))
      .max(30)
      .optional(),
  })
  .refine((b) => b.status !== undefined, {
    message: 'status is required',
  });
export type PatchPackStatusRequest = z.infer<
  typeof patchPackStatusRequestSchema
>;

/** Optional copy-only / partial update (UI convenience; not in SDD table). */
export const patchPackRequestSchema = z
  .object({
    status: packStatusSchema.optional(),
    title: z.string().min(1).max(200).nullable().optional(),
    caption: z.string().min(1).max(2200).nullable().optional(),
    hashtags: z
      .array(z.string().trim().min(1).max(100))
      .max(30)
      .optional(),
  })
  .refine(
    (b) =>
      b.status !== undefined ||
      b.title !== undefined ||
      b.caption !== undefined ||
      b.hashtags !== undefined,
    { message: 'At least one field is required' },
  );
export type PatchPackRequest = z.infer<typeof patchPackRequestSchema>;

/** File link in download payload (URLs OK for MVP — FR-PLT-005). */
export const packDownloadFileSchema = z.object({
  assetId: z.string().uuid(),
  name: z.string(),
  mime: z.string(),
  /** Relative API path — client prefixes API base URL. */
  url: z.string().min(1),
  kind: z.enum(['video', 'other']).default('video'),
});
export type PackDownloadFile = z.infer<typeof packDownloadFileSchema>;

export const packDownloadResponseSchema = z.object({
  packId: z.string().uuid(),
  platform: platformSchema,
  aspectRatio: aspectRatioSchema,
  status: packStatusSchema,
  title: z.string().nullable(),
  caption: z.string().nullable(),
  hashtags: z.array(z.string()),
  files: z.array(packDownloadFileSchema),
});
export type PackDownloadResponse = z.infer<typeof packDownloadResponseSchema>;
