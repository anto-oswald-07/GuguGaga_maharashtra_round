import type {
  AssetDto,
  AssetListQuery,
  AssetListResponse,
  UpdateAssetRequest,
} from '@creatorai/shared';
import type { Asset, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { storage } from '../../storage/local';
import { assetTypeFromMime } from './mime';

export class AssetHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'AssetHttpError';
  }
}

function toAssetDto(row: Asset): AssetDto {
  const metadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    name: row.name,
    path: row.path,
    mime: row.mime,
    size: Number(row.size),
    tags: row.tags,
    description: row.description,
    metadata,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function uploadAsset(opts: {
  workspaceId: string;
  filename: string;
  mime: string;
  data: Buffer;
  name?: string;
  description?: string | null;
  tags?: string[];
}): Promise<AssetDto> {
  const type = assetTypeFromMime(opts.mime);
  if (!type) {
    throw new AssetHttpError(
      415,
      'unsupported_media_type',
      `MIME type not allowed: ${opts.mime}`,
    );
  }

  if (opts.data.byteLength === 0) {
    throw new AssetHttpError(400, 'validation_error', 'Empty file upload');
  }

  const saved = await storage.saveOriginal({
    workspaceId: opts.workspaceId,
    filename: opts.filename,
    data: opts.data,
  });

  const displayName =
    (opts.name?.trim() || saved.filename).slice(0, 255) || saved.filename;

  const row = await prisma.asset.create({
    data: {
      id: saved.assetId,
      workspaceId: opts.workspaceId,
      type,
      name: displayName,
      path: saved.relativePath,
      mime: opts.mime.toLowerCase().split(';')[0]!.trim(),
      size: BigInt(saved.size),
      tags: opts.tags ?? [],
      description: opts.description ?? null,
      metadata: {},
    },
  });

  return toAssetDto(row);
}

export async function listAssets(
  workspaceId: string,
  query: AssetListQuery,
): Promise<AssetListResponse> {
  const where: Prisma.AssetWhereInput = {
    workspaceId,
    deletedAt: null,
  };

  if (query.type) {
    where.type = query.type;
  }
  if (query.q?.trim()) {
    where.name = { contains: query.q.trim(), mode: 'insensitive' };
  }
  if (query.tag?.trim()) {
    where.tags = { has: query.tag.trim() };
  }

  const rows = await prisma.asset.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return { items: rows.map(toAssetDto) };
}

export async function getAsset(
  workspaceId: string,
  assetId: string,
): Promise<AssetDto> {
  const row = await prisma.asset.findFirst({
    where: { id: assetId, workspaceId, deletedAt: null },
  });
  if (!row) {
    throw new AssetHttpError(404, 'not_found', 'Asset not found');
  }
  return toAssetDto(row);
}

export async function updateAsset(
  workspaceId: string,
  assetId: string,
  input: UpdateAssetRequest,
): Promise<AssetDto> {
  const existing = await prisma.asset.findFirst({
    where: { id: assetId, workspaceId, deletedAt: null },
  });
  if (!existing) {
    throw new AssetHttpError(404, 'not_found', 'Asset not found');
  }

  const row = await prisma.asset.update({
    where: { id: assetId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    },
  });

  return toAssetDto(row);
}

export async function softDeleteAsset(
  workspaceId: string,
  assetId: string,
): Promise<{ id: string; deletedAt: string }> {
  const existing = await prisma.asset.findFirst({
    where: { id: assetId, workspaceId, deletedAt: null },
  });
  if (!existing) {
    throw new AssetHttpError(404, 'not_found', 'Asset not found');
  }

  const row = await prisma.asset.update({
    where: { id: assetId },
    data: { deletedAt: new Date() },
  });

  return {
    id: row.id,
    deletedAt: row.deletedAt!.toISOString(),
  };
}

export async function getAssetForContent(
  workspaceId: string,
  assetId: string,
): Promise<{ mime: string; name: string; path: string }> {
  const row = await prisma.asset.findFirst({
    where: { id: assetId, workspaceId, deletedAt: null },
  });
  if (!row) {
    throw new AssetHttpError(404, 'not_found', 'Asset not found');
  }
  const exists = await storage.exists(row.path);
  if (!exists) {
    throw new AssetHttpError(404, 'not_found', 'Asset file missing on disk');
  }
  return { mime: row.mime, name: row.name, path: row.path };
}
