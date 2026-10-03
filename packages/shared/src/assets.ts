import { z } from 'zod';

/** Asset type enum — mirrors Prisma `AssetType`. */
export const assetTypeSchema = z.enum([
  'VIDEO',
  'IMAGE',
  'AUDIO',
  'DOCUMENT',
  'OTHER',
]);
export type AssetType = z.infer<typeof assetTypeSchema>;

export const ASSET_TYPES = assetTypeSchema.options;

export const assetSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  type: assetTypeSchema,
  name: z.string().min(1).max(255),
  path: z.string().min(1),
  mime: z.string().min(1),
  size: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  description: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AssetDto = z.infer<typeof assetSchema>;

export const assetListQuerySchema = z.object({
  type: assetTypeSchema.optional(),
  q: z.string().max(200).optional(),
  tag: z.string().max(100).optional(),
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

export const updateAssetRequestSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    tags: z.array(z.string().min(1).max(64)).max(50).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.tags !== undefined,
    { message: 'At least one of name, description, or tags is required' },
  );
export type UpdateAssetRequest = z.infer<typeof updateAssetRequestSchema>;

export const assetListResponseSchema = z.object({
  items: z.array(assetSchema),
});
export type AssetListResponse = z.infer<typeof assetListResponseSchema>;
