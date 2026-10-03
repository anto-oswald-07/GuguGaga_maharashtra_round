import type {
  EditTimelineDetailDto,
  EditTimelineDto,
  EditTimelineJson,
  EnqueueJobResponse,
  GenerateTimelineRequest,
  PutTimelineRequest,
  TimelineListResponse,
  TimelineSource,
  TimelineVersionDto,
} from '@creatorai/shared';
import { editTimelineJsonSchema } from '@creatorai/shared';
import type {
  EditTimeline,
  Prisma,
  TimelineSource as PrismaTimelineSource,
  TimelineVersion,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../db/prisma';
import { storage } from '../../storage/local';
import { enqueueJob } from '../jobs/queue';

export class TimelinesHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'TimelinesHttpError';
  }
}

const SOURCE_TO_DTO: Record<PrismaTimelineSource, TimelineSource> = {
  USER: 'user',
  AI_PROPOSAL: 'ai_proposal',
};

type TimelineRow = EditTimeline & {
  versions: TimelineVersion[];
  currentVersion: TimelineVersion | null;
};

function parseTimelineContent(raw: unknown): EditTimelineJson {
  const parsed = editTimelineJsonSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TimelinesHttpError(
      500,
      'internal_error',
      `Stored timeline JSON invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  return parsed.data;
}

function toVersionDto(row: TimelineVersion): TimelineVersionDto {
  return {
    id: row.id,
    editTimelineId: row.editTimelineId,
    version: row.version,
    content: parseTimelineContent(row.content),
    source: SOURCE_TO_DTO[row.source],
    createdAt: row.createdAt.toISOString(),
  };
}

function pickPendingProposal(versions: TimelineVersion[]): {
  content: EditTimelineJson | null;
  versionId: string | null;
} {
  const proposals = versions
    .filter((v) => v.source === 'AI_PROPOSAL')
    .sort((a, b) => b.version - a.version);
  const latest = proposals[0];
  if (!latest) {
    return { content: null, versionId: null };
  }
  return {
    content: parseTimelineContent(latest.content),
    versionId: latest.id,
  };
}

function toTimelineDto(row: TimelineRow): EditTimelineDto {
  const pending = pickPendingProposal(row.versions);
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    currentVersionId: row.currentVersionId,
    previewAssetId: row.previewAssetId,
    current: row.currentVersion
      ? parseTimelineContent(row.currentVersion.content)
      : null,
    pendingProposal: pending.content,
    pendingProposalVersionId: pending.versionId,
    versionCount: row.versions.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetailDto(row: TimelineRow): EditTimelineDetailDto {
  const versionsAsc = [...row.versions].sort((a, b) => a.version - b.version);
  return {
    ...toTimelineDto(row),
    versions: versionsAsc.map(toVersionDto),
  };
}

async function assertOwnedProject(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    throw new TimelinesHttpError(404, 'not_found', 'Project not found');
  }
}

const versionInclude = {
  versions: { orderBy: { version: 'desc' as const } },
  currentVersion: true,
};

async function findOwnedTimeline(
  workspaceId: string,
  timelineId: string,
): Promise<TimelineRow> {
  const row = await prisma.editTimeline.findFirst({
    where: {
      id: timelineId,
      project: { workspaceId, deletedAt: null },
    },
    include: versionInclude,
  });
  if (!row) {
    throw new TimelinesHttpError(404, 'not_found', 'Timeline not found');
  }
  return row;
}

/**
 * Deterministic demo timeline (SDD §4.3 shape) when AiProvider.proposeTimeline
 * is not ready or throws. Uses accepted clips / mappings / script hook when present.
 */
export function mockTimelineJson(params: {
  assetId: string;
  hookText?: string;
  clipWindows?: Array<{ startMs: number; endMs: number; title?: string }>;
}): EditTimelineJson {
  const windows =
    params.clipWindows && params.clipWindows.length > 0
      ? params.clipWindows.slice(0, 3)
      : [{ startMs: 0, endMs: 15_000, title: 'Hook' }];

  let cursor = 0;
  const clips = windows.map((w, i) => {
    const srcStart = Math.max(0, Math.floor(w.startMs));
    const srcEnd = Math.max(srcStart + 1, Math.floor(w.endMs));
    const duration = srcEnd - srcStart;
    const clip = {
      id: `c${i + 1}`,
      assetId: params.assetId,
      srcStartMs: srcStart,
      srcEndMs: srcEnd,
      timelineStartMs: cursor,
    };
    cursor += duration;
    return clip;
  });

  const durationMs = Math.max(cursor, 5_000);
  const hook = (params.hookText?.trim() || 'HOOK HERE').slice(0, 120);

  return {
    schemaVersion: '1.0',
    fps: 30,
    durationMs,
    tracks: [
      {
        id: 'v1',
        type: 'video',
        clips,
      },
      {
        id: 't1',
        type: 'text',
        items: [
          {
            id: 'tx1',
            text: hook,
            startMs: 0,
            endMs: Math.min(3_000, durationMs),
            style: { position: 'bottom', fontSize: 48 },
          },
        ],
      },
      {
        id: 'cap1',
        type: 'captions',
        items: [
          {
            id: 's1',
            text: hook,
            startMs: 0,
            endMs: Math.min(1_800, durationMs),
          },
        ],
      },
    ],
    transitions: [],
    meta: {
      generatedBy: 'ai',
      provider: 'mock-fallback',
      prompt: 'Phase 8 demo timeline proposal',
    },
  };
}

/**
 * Coerce opaque AiProvider EditTimeline stubs into schemaVersion 1.0 JSON.
 */
export function normalizeProviderTimeline(
  raw: unknown,
  fallback: EditTimelineJson,
): EditTimelineJson {
  const direct = editTimelineJsonSchema.safeParse(raw);
  if (direct.success) return direct.data;

  // Legacy stub shape from packages/ai-provider: { version:1, clips:[], notes }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.clips) && o.clips.length > 0) {
      const assetId =
        fallback.tracks.find((t) => t.type === 'video')?.clips[0]?.assetId ??
        randomUUID();
      const windows = (o.clips as Array<Record<string, unknown>>).map((c) => ({
        startMs: typeof c.startMs === 'number' ? c.startMs : 0,
        endMs: typeof c.endMs === 'number' ? c.endMs : 5_000,
        title: typeof c.label === 'string' ? c.label : undefined,
      }));
      const notes = typeof o.notes === 'string' ? o.notes : undefined;
      const built = mockTimelineJson({
        assetId,
        hookText: notes,
        clipWindows: windows,
      });
      return {
        ...built,
        meta: {
          ...built.meta,
          generatedBy: 'ai',
          provider: 'normalized-stub',
          notes,
        },
      };
    }
  }

  return fallback;
}

/**
 * Enqueue GENERATE_TIMELINE (SDD §5.7). Result is stored as AI_PROPOSAL version
 * only — never updates currentVersionId (Apply = PUT with proposal JSON).
 */
export async function enqueueGenerateTimeline(
  workspaceId: string,
  projectId: string,
  input: GenerateTimelineRequest,
): Promise<EnqueueJobResponse> {
  await assertOwnedProject(workspaceId, projectId);

  let scriptId = input.scriptId;
  if (scriptId) {
    const script = await prisma.scriptDocument.findFirst({
      where: {
        id: scriptId,
        projectId,
        project: { workspaceId, deletedAt: null },
      },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!script) {
      throw new TimelinesHttpError(404, 'not_found', 'Script not found');
    }
    if (script.versions.length === 0) {
      throw new TimelinesHttpError(
        400,
        'validation_error',
        'Script has no versions',
      );
    }
  } else {
    const latest = await prisma.scriptDocument.findFirst({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!latest || latest.versions.length === 0) {
      throw new TimelinesHttpError(
        400,
        'validation_error',
        'No script on this project — create/generate a script first',
      );
    }
    scriptId = latest.id;
  }

  let timelineId = input.timelineId;
  if (timelineId) {
    await findOwnedTimeline(workspaceId, timelineId);
  } else {
    const existing = await prisma.editTimeline.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) {
      timelineId = existing.id;
    } else {
      const created = await prisma.editTimeline.create({
        data: {
          projectId,
          title: input.title ?? 'Main timeline',
        },
        select: { id: true },
      });
      timelineId = created.id;
    }
  }

  if (input.title) {
    await prisma.editTimeline.update({
      where: { id: timelineId },
      data: { title: input.title },
    });
  }

  const job = await enqueueJob({
    workspaceId,
    projectId,
    type: 'GENERATE_TIMELINE',
    input: {
      scriptId,
      timelineId,
    },
  });

  return { jobId: job.id };
}

export async function listTimelines(
  workspaceId: string,
  projectId: string,
): Promise<TimelineListResponse> {
  await assertOwnedProject(workspaceId, projectId);

  const rows = await prisma.editTimeline.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: versionInclude,
  });

  return { items: rows.map(toTimelineDto) };
}

export async function getTimeline(
  workspaceId: string,
  timelineId: string,
): Promise<EditTimelineDetailDto> {
  const row = await findOwnedTimeline(workspaceId, timelineId);
  return toDetailDto(row);
}

/**
 * Save user edits: always appends a new USER TimelineVersion and sets it current.
 * This is also how **Apply** works — PUT the AI proposal JSON (optionally edited).
 * Never overwrites prior version rows.
 */
export async function putTimeline(
  workspaceId: string,
  timelineId: string,
  input: PutTimelineRequest,
): Promise<EditTimelineDetailDto> {
  const existing = await findOwnedTimeline(workspaceId, timelineId);

  const parsed = editTimelineJsonSchema.safeParse(input.timeline);
  if (!parsed.success) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      parsed.error.issues.map((i) => i.message).join('; '),
    );
  }

  const nextVersion =
    existing.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;

  const versionId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.timelineVersion.create({
      data: {
        id: versionId,
        editTimelineId: timelineId,
        version: nextVersion,
        content: parsed.data as Prisma.InputJsonValue,
        source: 'USER',
      },
    });
    await tx.editTimeline.update({
      where: { id: timelineId },
      data: {
        currentVersionId: versionId,
        title: input.title ?? existing.title,
      },
    });
  });

  return getTimeline(workspaceId, timelineId);
}

/**
 * Enqueue RENDER_TIMELINE for the **current** (applied) version only.
 */
export async function enqueueRenderTimeline(
  workspaceId: string,
  timelineId: string,
): Promise<EnqueueJobResponse> {
  const timeline = await findOwnedTimeline(workspaceId, timelineId);

  if (!timeline.currentVersionId || !timeline.currentVersion) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      'No applied timeline version — Apply a proposal (PUT) before render',
    );
  }

  const content = parseTimelineContent(timeline.currentVersion.content);
  const videoTrack = content.tracks.find((t) => t.type === 'video');
  const firstClip = videoTrack?.clips[0];
  if (!firstClip) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      'Timeline has no video clips to render',
    );
  }

  const source = await prisma.asset.findFirst({
    where: {
      id: firstClip.assetId,
      workspaceId,
      deletedAt: null,
    },
    select: { path: true },
  });
  if (!source) {
    throw new TimelinesHttpError(
      404,
      'not_found',
      `Source asset ${firstClip.assetId} not found`,
    );
  }

  const job = await enqueueJob({
    workspaceId,
    projectId: timeline.projectId,
    type: 'RENDER_TIMELINE',
    input: {
      timelineId: timeline.id,
      versionId: timeline.currentVersionId,
      version: timeline.currentVersion.version,
      sourceAssetId: firstClip.assetId,
      inputPath: source.path,
    },
  });

  return { jobId: job.id };
}

/**
 * Persist AI proposal version. Does **not** change currentVersionId.
 */
export async function persistTimelineProposal(params: {
  workspaceId: string;
  projectId: string;
  timelineId: string;
  content: EditTimelineJson;
}): Promise<{ versionId: string; version: number }> {
  await assertOwnedProject(params.workspaceId, params.projectId);

  const timeline = await findOwnedTimeline(
    params.workspaceId,
    params.timelineId,
  );
  if (timeline.projectId !== params.projectId) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      'Timeline does not belong to this project',
    );
  }

  const parsed = editTimelineJsonSchema.safeParse(params.content);
  if (!parsed.success) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      parsed.error.issues.map((i) => i.message).join('; '),
    );
  }

  const nextVersion =
    timeline.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  const versionId = randomUUID();

  await prisma.timelineVersion.create({
    data: {
      id: versionId,
      editTimelineId: params.timelineId,
      version: nextVersion,
      content: parsed.data as Prisma.InputJsonValue,
      source: 'AI_PROPOSAL',
    },
  });

  // Touch parent updatedAt without changing currentVersionId.
  await prisma.editTimeline.update({
    where: { id: params.timelineId },
    data: { updatedAt: new Date() },
  });

  return { versionId, version: nextVersion };
}

/**
 * After RENDER_TIMELINE: register preview MP4 as Asset, link on EditTimeline.
 */
export async function persistTimelinePreview(params: {
  workspaceId: string;
  projectId: string;
  timelineId: string;
  outputPath: string;
  jobId: string;
}): Promise<{ assetId: string; relativePath: string }> {
  await assertOwnedProject(params.workspaceId, params.projectId);
  const timeline = await findOwnedTimeline(
    params.workspaceId,
    params.timelineId,
  );
  if (timeline.projectId !== params.projectId) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      'Timeline does not belong to this project',
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
      'timeline-preview.mp4',
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
    throw new TimelinesHttpError(
      500,
      'internal_error',
      `Rendered file missing: ${absoluteOut}`,
    );
  }

  const assetId = randomUUID();
  const displayName = `${(timeline.title || 'timeline').slice(0, 160)}-preview.mp4`;

  await prisma.$transaction(async (tx) => {
    await tx.asset.create({
      data: {
        id: assetId,
        workspaceId: params.workspaceId,
        type: 'VIDEO',
        name: displayName,
        path: relativePath,
        mime: 'video/mp4',
        size: BigInt(fileSize),
        tags: ['timeline', 'preview', 'rendered'],
        description: `Timeline preview for ${timeline.id}`,
        metadata: {
          editTimelineId: timeline.id,
          versionId: timeline.currentVersionId,
          jobId: params.jobId,
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

    await tx.editTimeline.update({
      where: { id: timeline.id },
      data: { previewAssetId: assetId },
    });
  });

  return { assetId, relativePath };
}

/** Load context for GENERATE_TIMELINE job handler. */
export async function loadTimelineGenerateContext(
  workspaceId: string,
  projectId: string,
  scriptId: string,
): Promise<{
  hook: string;
  body: string;
  cta: string;
  title?: string;
  assetId: string;
  clipWindows: Array<{ startMs: number; endMs: number; title?: string }>;
  alignments: Array<{
    scriptExcerpt: string;
    startMs: number;
    endMs: number;
    confidence: number;
  }>;
}> {
  const script = await prisma.scriptDocument.findFirst({
    where: {
      id: scriptId,
      projectId,
      project: { workspaceId, deletedAt: null },
    },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!script || script.versions.length === 0) {
    throw new TimelinesHttpError(404, 'not_found', 'Script not found');
  }

  const content = script.versions[0]!.content as Record<string, unknown>;
  const hook = typeof content.hook === 'string' ? content.hook : '';
  const body = typeof content.body === 'string' ? content.body : '';
  const cta = typeof content.cta === 'string' ? content.cta : '';
  const title = typeof content.title === 'string' ? content.title : undefined;

  const accepted = await prisma.clipCandidate.findMany({
    where: {
      projectId,
      status: { in: ['ACCEPTED', 'RENDERED'] },
    },
    orderBy: [{ score: 'desc' }, { startMs: 'asc' }],
    take: 5,
  });

  const mappings = await prisma.scriptFootageMap.findMany({
    where: { projectId },
    orderBy: { startMs: 'asc' },
    take: 20,
  });

  let assetId =
    accepted[0]?.sourceAssetId ??
    (
      await prisma.projectAsset.findFirst({
        where: {
          projectId,
          asset: { workspaceId, deletedAt: null, type: 'VIDEO' },
        },
        select: { assetId: true },
        orderBy: { attachedAt: 'desc' },
      })
    )?.assetId;

  if (!assetId) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      'No video asset on project — attach footage before generating timeline',
    );
  }

  const clipWindows =
    accepted.length > 0
      ? accepted.map((c) => ({
          startMs: c.startMs,
          endMs: c.endMs,
          title: c.title,
        }))
      : mappings.length > 0
        ? mappings.map((m) => ({
            startMs: m.startMs,
            endMs: m.endMs,
            title: m.scriptRef.slice(0, 80),
          }))
        : [{ startMs: 0, endMs: 5_000, title: 'Intro' }];

  return {
    hook,
    body,
    cta,
    title,
    assetId,
    clipWindows,
    alignments: mappings.map((m) => ({
      scriptExcerpt: m.scriptRef,
      startMs: m.startMs,
      endMs: m.endMs,
      confidence: m.confidence,
    })),
  };
}

/**
 * Load applied timeline JSON + resolve assetId → absolute media paths
 * for RENDER_TIMELINE (Cyrus renderTimeline).
 */
export async function loadTimelineRenderContext(
  workspaceId: string,
  timelineId: string,
): Promise<{
  timeline: EditTimelineJson;
  versionId: string;
  assetPaths: Record<string, string>;
}> {
  const row = await findOwnedTimeline(workspaceId, timelineId);
  if (!row.currentVersionId || !row.currentVersion) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      'No applied timeline version — Apply a proposal (PUT) before render',
    );
  }

  const timeline = parseTimelineContent(row.currentVersion.content);
  const assetIds = new Set<string>();
  for (const track of timeline.tracks) {
    if (track.type === 'video' || track.type === 'audio') {
      for (const clip of track.clips) {
        assetIds.add(clip.assetId);
      }
    }
  }
  if (assetIds.size === 0) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      'Timeline has no video/image/audio clips to render',
    );
  }

  const assets = await prisma.asset.findMany({
    where: {
      id: { in: [...assetIds] },
      workspaceId,
      deletedAt: null,
    },
    select: { id: true, path: true },
  });
  if (assets.length !== assetIds.size) {
    const found = new Set(assets.map((a) => a.id));
    const missing = [...assetIds].filter((id) => !found.has(id));
    throw new TimelinesHttpError(
      404,
      'not_found',
      `Source asset(s) not found: ${missing.join(', ')}`,
    );
  }

  const assetPaths: Record<string, string> = {};
  for (const a of assets) {
    assetPaths[a.id] = storage.absoluteFromRelative(a.path);
  }

  return {
    timeline,
    versionId: row.currentVersionId,
    assetPaths,
  };
}
