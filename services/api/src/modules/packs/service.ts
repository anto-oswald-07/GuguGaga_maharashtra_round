import type {
  AspectRatio,
  EnqueueJobResponse,
  GeneratePacksRequest,
  PackDownloadResponse,
  PackListResponse,
  PackStatus,
  PatchPackRequest,
  PatchPackStatusRequest,
  Platform,
  PlatformPackDto,
} from '@creatorai/shared';
import { API_PREFIX, PLATFORM_DEFAULT_ASPECT } from '@creatorai/shared';
import type {
  AspectRatio as PrismaAspectRatio,
  PackStatus as PrismaPackStatus,
  Platform as PrismaPlatform,
  PlatformPack,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { renderTimeline, renderTimelinePath } from 'worker/media/renderTimeline';
import { prisma } from '../../db/prisma';
import { storage } from '../../storage/local';
import { enqueueJob } from '../jobs/queue';
import {
  loadTimelineRenderContext,
  persistTimelinePreview,
} from '../timelines/service';

export class PacksHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'PacksHttpError';
  }
}

const STATUS_TO_DTO: Record<PrismaPackStatus, PackStatus> = {
  DRAFT: 'draft',
  READY: 'ready',
  PUBLISHED: 'published',
};

const STATUS_TO_PRISMA: Record<PackStatus, PrismaPackStatus> = {
  draft: 'DRAFT',
  ready: 'READY',
  published: 'PUBLISHED',
};

const ASPECT_TO_DTO: Record<PrismaAspectRatio, AspectRatio> = {
  R_16_9: 'R_16_9',
  R_9_16: 'R_9_16',
  R_1_1: 'R_1_1',
};

function toPackDto(row: PlatformPack): PlatformPackDto {
  return {
    id: row.id,
    projectId: row.projectId,
    platform: row.platform,
    aspectRatio: ASPECT_TO_DTO[row.aspectRatio],
    status: STATUS_TO_DTO[row.status],
    title: row.title,
    caption: row.caption,
    hashtags: row.hashtags,
    outputAssetId: row.outputAssetId,
    sourceAssetId: row.sourceAssetId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertOwnedProject(
  workspaceId: string,
  projectId: string,
): Promise<{
  id: string;
  targetPlatforms: PrismaPlatform[];
}> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId, deletedAt: null },
    select: { id: true, targetPlatforms: true },
  });
  if (!project) {
    throw new PacksHttpError(404, 'not_found', 'Project not found');
  }
  return project;
}

async function findOwnedPack(
  workspaceId: string,
  packId: string,
): Promise<PlatformPack> {
  const row = await prisma.platformPack.findFirst({
    where: {
      id: packId,
      project: { workspaceId, deletedAt: null },
    },
  });
  if (!row) {
    throw new PacksHttpError(404, 'not_found', 'Platform pack not found');
  }
  return row;
}

/**
 * Render the saved timeline preview if missing or stale so platform packs
 * always adapt what was saved on the edit page.
 */
async function ensureTimelineRendered(
  workspaceId: string,
  projectId: string,
  timelineId: string,
): Promise<string> {
  const timeline = await prisma.editTimeline.findFirst({
    where: {
      id: timelineId,
      projectId,
      project: { workspaceId, deletedAt: null },
    },
    include: {
      currentVersion: true,
      versions: { orderBy: { version: 'desc' }, take: 1 },
      previewAsset: true,
    },
  });
  if (!timeline) {
    throw new PacksHttpError(404, 'not_found', 'Timeline not found');
  }

  // If already rendered and preview is up-to-date with timeline edits and file exists on disk
  if (
    timeline.previewAssetId &&
    timeline.previewAsset &&
    timeline.previewAsset.createdAt >= timeline.updatedAt &&
    (await storage.exists(timeline.previewAsset.path))
  ) {
    return timeline.previewAssetId;
  }

  // Ensure currentVersionId is set if versions exist
  if (!timeline.currentVersionId && timeline.versions[0]) {
    await prisma.editTimeline.update({
      where: { id: timeline.id },
      data: { currentVersionId: timeline.versions[0].id },
    });
  }

  try {
    const ctx = await loadTimelineRenderContext(workspaceId, timeline.id);
    const renderJobId = randomUUID();
    const absOutput = renderTimelinePath(
      storage.getRoot(),
      workspaceId,
      renderJobId,
    );

    try {
      await renderTimeline(ctx.timeline, {
        assetPaths: ctx.assetPaths,
        outputPath: absOutput,
        burnCaptions: true,
      });
    } catch {
      const firstPath = Object.values(ctx.assetPaths)[0];
      if (firstPath) {
        await mkdir(path.dirname(absOutput), { recursive: true });
        await copyFile(firstPath, absOutput);
      }
    }

    const persisted = await persistTimelinePreview({
      workspaceId,
      projectId,
      timelineId: timeline.id,
      outputPath: absOutput,
      jobId: renderJobId,
    });
    return persisted.assetId;
  } catch (err) {
    if (timeline.previewAssetId) return timeline.previewAssetId;
    throw err;
  }
}

/**
 * Prefer: explicit source → rendered saved edit timeline → latest rendered clip → project VIDEO.
 */
async function resolveSourceAssetId(
  workspaceId: string,
  projectId: string,
  input: GeneratePacksRequest,
): Promise<string> {
  if (input.sourceAssetId) {
    const link = await prisma.projectAsset.findFirst({
      where: {
        projectId,
        assetId: input.sourceAssetId,
        project: { workspaceId, deletedAt: null },
        asset: { workspaceId, deletedAt: null, type: 'VIDEO' },
      },
      select: { assetId: true },
    });
    if (!link) {
      throw new PacksHttpError(
        404,
        'not_found',
        'Source asset not found on this project',
      );
    }
    return link.assetId;
  }

  // Check if timeline is provided, or find the project's saved EditTimeline
  const targetTimelineId =
    input.timelineId ??
    (
      await prisma.editTimeline.findFirst({
        where: {
          projectId,
          project: { workspaceId, deletedAt: null },
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      })
    )?.id;

  if (targetTimelineId) {
    try {
      const renderedAssetId = await ensureTimelineRendered(
        workspaceId,
        projectId,
        targetTimelineId,
      );
      if (renderedAssetId) return renderedAssetId;
    } catch {
      // Fall through to clip / project video fallback if render fails
    }
  }

  const renderedClip = await prisma.clipCandidate.findFirst({
    where: {
      projectId,
      status: 'RENDERED',
      renderedAssetId: { not: null },
      project: { workspaceId, deletedAt: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: { renderedAssetId: true },
  });
  if (renderedClip?.renderedAssetId) {
    return renderedClip.renderedAssetId;
  }

  const projectVideo = await prisma.projectAsset.findFirst({
    where: {
      projectId,
      asset: { workspaceId, deletedAt: null, type: 'VIDEO' },
    },
    orderBy: { attachedAt: 'desc' },
    select: { assetId: true },
  });
  if (!projectVideo) {
    throw new PacksHttpError(
      400,
      'validation_error',
      'No video source on this project — attach footage, render a clip, or render a timeline preview first',
    );
  }
  return projectVideo.assetId;
}

function normalizeHashtags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of raw) {
    const cleaned = h.replace(/^#+/, '').trim();
    if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    out.push(cleaned);
  }
  return out.slice(0, 30);
}

/**
 * Enqueue ADAPT_PLATFORM (SDD §5.8). Upserts one PlatformPack per platform
 * (unique projectId+platform), resets status to DRAFT, clears prior output.
 */
export async function enqueueGeneratePacks(
  workspaceId: string,
  projectId: string,
  input: GeneratePacksRequest,
): Promise<EnqueueJobResponse> {
  const project = await assertOwnedProject(workspaceId, projectId);

  const rawPlatforms =
    input.platforms && input.platforms.length > 0
      ? input.platforms
      : (project.targetPlatforms as Platform[]);

  const platforms: Platform[] =
    rawPlatforms.length > 0
      ? rawPlatforms
      : (['YOUTUBE', 'TIKTOK', 'LINKEDIN'] as Platform[]);

  const sourceAssetId = await resolveSourceAssetId(
    workspaceId,
    projectId,
    input,
  );

  const packIds: string[] = [];
  for (const platform of platforms) {
    const aspect =
      PLATFORM_DEFAULT_ASPECT[platform] ?? ('R_9_16' as AspectRatio);

    const existing = await prisma.platformPack.findUnique({
      where: {
        projectId_platform: { projectId, platform },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.platformPack.update({
        where: { id: existing.id },
        data: {
          aspectRatio: aspect,
          status: 'DRAFT',
          sourceAssetId,
          outputAssetId: null,
          title: null,
          caption: null,
          hashtags: [],
        },
      });
      packIds.push(existing.id);
    } else {
      const created = await prisma.platformPack.create({
        data: {
          projectId,
          platform,
          aspectRatio: aspect,
          status: 'DRAFT',
          sourceAssetId,
        },
        select: { id: true },
      });
      packIds.push(created.id);
    }
  }

  // Persist target platforms on project if caller supplied an explicit list.
  if (input.platforms && input.platforms.length > 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: { targetPlatforms: platforms },
    });
  }

  const job = await enqueueJob({
    workspaceId,
    projectId,
    type: 'ADAPT_PLATFORM',
    input: {
      packIds,
      platforms,
      sourceAssetId,
      timelineId: input.timelineId ?? null,
    },
  });

  return { jobId: job.id };
}

export async function listPacks(
  workspaceId: string,
  projectId: string,
): Promise<PackListResponse> {
  await assertOwnedProject(workspaceId, projectId);

  const rows = await prisma.platformPack.findMany({
    where: { projectId },
    orderBy: [{ platform: 'asc' }, { createdAt: 'asc' }],
  });

  return { items: rows.map(toPackDto) };
}

export async function getPack(
  workspaceId: string,
  packId: string,
): Promise<PlatformPackDto> {
  const row = await findOwnedPack(workspaceId, packId);
  return toPackDto(row);
}

export async function patchPackStatus(
  workspaceId: string,
  packId: string,
  input: PatchPackStatusRequest,
): Promise<PlatformPackDto> {
  await findOwnedPack(workspaceId, packId);

  const data: {
    status: PrismaPackStatus;
    title?: string | null;
    caption?: string | null;
    hashtags?: string[];
  } = {
    status: STATUS_TO_PRISMA[input.status],
  };
  if (input.title !== undefined) data.title = input.title;
  if (input.caption !== undefined) data.caption = input.caption;
  if (input.hashtags !== undefined) {
    data.hashtags = normalizeHashtags(input.hashtags);
  }

  const updated = await prisma.platformPack.update({
    where: { id: packId },
    data,
  });
  return toPackDto(updated);
}

export async function patchPack(
  workspaceId: string,
  packId: string,
  input: PatchPackRequest,
): Promise<PlatformPackDto> {
  await findOwnedPack(workspaceId, packId);

  const data: {
    status?: PrismaPackStatus;
    title?: string | null;
    caption?: string | null;
    hashtags?: string[];
  } = {};
  if (input.status !== undefined) data.status = STATUS_TO_PRISMA[input.status];
  if (input.title !== undefined) data.title = input.title;
  if (input.caption !== undefined) data.caption = input.caption;
  if (input.hashtags !== undefined) {
    data.hashtags = normalizeHashtags(input.hashtags);
  }

  const updated = await prisma.platformPack.update({
    where: { id: packId },
    data,
  });
  return toPackDto(updated);
}

/**
 * Download links for pack outputs (URLs OK for MVP — FR-PLT-005).
 */
export async function getPackDownload(
  workspaceId: string,
  packId: string,
): Promise<PackDownloadResponse> {
  const pack = await findOwnedPack(workspaceId, packId);

  const files: PackDownloadResponse['files'] = [];
  const candidates: Array<{ id: string; isAdapted: boolean }> = [];
  if (pack.outputAssetId) {
    candidates.push({ id: pack.outputAssetId, isAdapted: true });
  }
  if (pack.sourceAssetId && pack.sourceAssetId !== pack.outputAssetId) {
    candidates.push({ id: pack.sourceAssetId, isAdapted: false });
  }

  for (const cand of candidates) {
    const asset = await prisma.asset.findFirst({
      where: {
        id: cand.id,
        workspaceId,
        deletedAt: null,
      },
      select: { id: true, name: true, mime: true, path: true },
    });
    if (asset && (await storage.exists(asset.path))) {
      const filename = cand.isAdapted
        ? `pack-${pack.platform.toLowerCase()}-${pack.aspectRatio.toLowerCase().replace(/^r_/, '')}.mp4`
        : (asset.name || `pack-${pack.platform.toLowerCase()}.mp4`);
      files.push({
        assetId: asset.id,
        name: filename,
        mime: asset.mime,
        url: `${API_PREFIX}/packs/${pack.id}/download-file`,
        kind: 'video',
      });
      break;
    }
  }

  return {
    packId: pack.id,
    platform: pack.platform,
    aspectRatio: ASPECT_TO_DTO[pack.aspectRatio],
    status: STATUS_TO_DTO[pack.status],
    title: pack.title,
    caption: pack.caption,
    hashtags: pack.hashtags,
    files,
  };
}

export async function getPackFileToDownload(
  workspaceId: string,
  packId: string,
): Promise<{
  path: string;
  name: string;
  mime: string;
}> {
  const pack = await findOwnedPack(workspaceId, packId);
  const candidates: Array<{ id: string; isAdapted: boolean }> = [];
  if (pack.outputAssetId) {
    candidates.push({ id: pack.outputAssetId, isAdapted: true });
  }
  if (pack.sourceAssetId && pack.sourceAssetId !== pack.outputAssetId) {
    candidates.push({ id: pack.sourceAssetId, isAdapted: false });
  }
  if (candidates.length === 0) {
    throw new PacksHttpError(
      404,
      'not_found',
      'This pack has no output video or source video available for download. Generate packs first.',
    );
  }

  for (const cand of candidates) {
    const asset = await prisma.asset.findFirst({
      where: {
        id: cand.id,
        workspaceId,
        deletedAt: null,
      },
      select: { id: true, name: true, mime: true, path: true },
    });
    if (asset && (await storage.exists(asset.path))) {
      const filename = cand.isAdapted
        ? `pack-${pack.platform.toLowerCase()}-${pack.aspectRatio.toLowerCase().replace(/^r_/, '')}.mp4`
        : (asset.name || `pack-${pack.platform.toLowerCase()}.mp4`);
      return {
        path: asset.path,
        name: filename,
        mime: asset.mime || 'video/mp4',
      };
    }
  }

  throw new PacksHttpError(
    404,
    'not_found',
    'Video file for this pack is missing from storage disk. Please click Generate packs to recreate.',
  );
}

export async function deletePack(
  workspaceId: string,
  packId: string,
): Promise<{ id: string; deleted: true }> {
  await findOwnedPack(workspaceId, packId);
  await prisma.platformPack.delete({ where: { id: packId } });
  return { id: packId, deleted: true };
}

/** Deterministic copy when generateSupporting is unavailable. */
export function mockPackCopy(platform: Platform, topicHint?: string): {
  title: string;
  caption: string;
  hashtags: string[];
} {
  const topic = (topicHint?.trim() || 'Creator tip').slice(0, 60);
  return {
    title: `${topic} — ${platform.replace(/_/g, ' ')}`,
    caption: `${topic}. Built for ${platform}. Save this for later.`,
    hashtags: normalizeHashtags([
      'creator',
      'contentbatch',
      platform.toLowerCase(),
      'shorts',
    ]),
  };
}

/**
 * After ADAPT_PLATFORM: register adapted MP4 as Asset, link on PlatformPack,
 * fill copy fields.
 */
export async function persistAdaptedPack(params: {
  workspaceId: string;
  projectId: string;
  packId: string;
  outputPath: string;
  jobId: string;
  title: string;
  caption: string;
  hashtags: string[];
  aspectRatio: AspectRatio;
}): Promise<{ assetId: string; relativePath: string }> {
  await assertOwnedProject(params.workspaceId, params.projectId);
  const pack = await findOwnedPack(params.workspaceId, params.packId);
  if (pack.projectId !== params.projectId) {
    throw new PacksHttpError(
      400,
      'validation_error',
      'Pack does not belong to this project',
    );
  }

  const storageRoot = path.resolve(storage.getRoot());
  let absoluteOut = params.outputPath;
  if (!path.isAbsolute(absoluteOut)) {
    absoluteOut = path.resolve(absoluteOut);
  }

  let relativePath: string;
  if (
    absoluteOut === storageRoot ||
    absoluteOut.startsWith(storageRoot + path.sep)
  ) {
    relativePath = path
      .relative(storageRoot, absoluteOut)
      .split(path.sep)
      .join('/');
  } else {
    relativePath = path.posix.join(
      'workspaces',
      params.workspaceId,
      'renders',
      params.jobId,
      `pack-${pack.platform.toLowerCase()}.mp4`,
    );
    const destAbs = storage.absoluteFromRelative(relativePath);
    await mkdir(path.dirname(destAbs), { recursive: true });
    await copyFile(absoluteOut, destAbs);
    absoluteOut = destAbs;
  }

  let fileSize = 0;
  try {
    fileSize = (await stat(absoluteOut)).size;
  } catch {
    throw new PacksHttpError(
      500,
      'internal_error',
      `Adapted file missing: ${absoluteOut}`,
    );
  }

  const assetId = randomUUID();
  const displayName = `${pack.platform.toLowerCase()}-${params.aspectRatio.toLowerCase()}.mp4`;

  await prisma.$transaction(async (tx) => {
    await tx.asset.create({
      data: {
        id: assetId,
        workspaceId: params.workspaceId,
        type: 'VIDEO',
        name: displayName.slice(0, 255),
        path: relativePath,
        mime: 'video/mp4',
        size: BigInt(fileSize),
        tags: ['pack', 'adapted', pack.platform.toLowerCase()],
        description: `Platform pack for ${pack.platform}`,
        metadata: {
          platformPackId: pack.id,
          platform: pack.platform,
          aspectRatio: params.aspectRatio,
          jobId: params.jobId,
          sourceAssetId: pack.sourceAssetId,
        },
      },
    });

    await tx.projectAsset.upsert({
      where: {
        projectId_assetId: {
          projectId: params.projectId,
          assetId,
        },
      },
      create: { projectId: params.projectId, assetId },
      update: {},
    });

    await tx.platformPack.update({
      where: { id: pack.id },
      data: {
        outputAssetId: assetId,
        aspectRatio: params.aspectRatio,
        title: params.title.slice(0, 200),
        caption: params.caption.slice(0, 2200),
        hashtags: normalizeHashtags(params.hashtags),
        status: 'DRAFT',
      },
    });
  });

  return { assetId, relativePath };
}

/** Load packs + source path for ADAPT_PLATFORM job handler. */
export async function loadAdaptPlatformContext(
  workspaceId: string,
  projectId: string,
  packIds: string[],
  sourceAssetId: string,
): Promise<{
  packs: PlatformPack[];
  sourcePath: string;
  scriptHint: string;
}> {
  await assertOwnedProject(workspaceId, projectId);

  const packs = await prisma.platformPack.findMany({
    where: {
      id: { in: packIds },
      projectId,
      project: { workspaceId, deletedAt: null },
    },
  });
  if (packs.length === 0) {
    throw new PacksHttpError(404, 'not_found', 'No packs found for job');
  }

  const source = await prisma.asset.findFirst({
    where: {
      id: sourceAssetId,
      workspaceId,
      deletedAt: null,
    },
    select: { path: true },
  });
  if (!source) {
    throw new PacksHttpError(404, 'not_found', 'Source asset not found');
  }

  const script = await prisma.scriptDocument.findFirst({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  let scriptHint = '';
  if (script?.versions[0]) {
    const c = script.versions[0].content as Record<string, unknown>;
    const parts = [c.title, c.hook, c.body, c.cta]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim());
    scriptHint = parts.join('\n').slice(0, 4000);
  }

  return {
    packs,
    sourcePath: storage.absoluteFromRelative(source.path),
    scriptHint,
  };
}

/** Absolute output path under storage renders/{jobId}/. */
export function adaptPackOutputPath(
  storageRoot: string,
  workspaceId: string,
  jobId: string,
  platform: string,
): string {
  return path.join(
    storageRoot,
    'workspaces',
    workspaceId,
    'renders',
    jobId,
    `pack-${platform.toLowerCase()}.mp4`,
  );
}
