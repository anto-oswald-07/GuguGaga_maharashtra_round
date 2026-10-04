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
  clipWindows?: Array<{
    startMs: number;
    endMs: number;
    title?: string;
    assetId?: string;
    spokenText?: string;
  }>;
  audioClips?: Array<{
    id?: string;
    assetId: string;
    srcStartMs?: number;
    srcEndMs: number;
    timelineStartMs?: number;
    label?: string;
  }>;
}): EditTimelineJson {
  const windows =
    params.clipWindows && params.clipWindows.length > 0
      ? params.clipWindows
      : [{ startMs: 0, endMs: 15_000, title: 'Hook' }];

  let cursor = 0;
  const captionItems: Array<{ id: string; text: string; startMs: number; endMs: number }> = [];
  const textItems: Array<{
    id: string;
    text: string;
    startMs: number;
    endMs: number;
    style?: { position: 'top' | 'center' | 'bottom'; fontSize: number };
  }> = [];

  const clips = windows.map((w, i) => {
    const srcStart = Math.max(0, Math.floor(w.startMs));
    const srcEnd = Math.max(srcStart + 1, Math.floor(w.endMs));
    const duration = srcEnd - srcStart;
    const clipStart = cursor;
    const clip = {
      id: `c${i + 1}`,
      assetId: w.assetId ?? params.assetId,
      srcStartMs: srcStart,
      srcEndMs: srcEnd,
      timelineStartMs: clipStart,
      label: w.title,
    };

    if (w.spokenText && w.spokenText.trim()) {
      const clean = w.spokenText.trim();
      const restrained =
        clean.length > 38 ? `${clean.slice(0, 35).trimEnd()}…` : clean;
      captionItems.push({
        id: `cap-${i + 1}`,
        text: restrained,
        startMs: clipStart,
        endMs: clipStart + duration,
      });
    }

    if (i > 0 && w.title && w.title.trim()) {
      const titleClean = w.title.trim();
      const restrainedTitle =
        titleClean.length > 40 ? `${titleClean.slice(0, 37).trimEnd()}…` : titleClean;
      textItems.push({
        id: `tx-${i + 1}`,
        text: restrainedTitle,
        startMs: clipStart,
        endMs: Math.min(clipStart + 2500, clipStart + duration),
        style: { position: 'bottom', fontSize: 32 },
      });
    }

    cursor += duration;
    return clip;
  });

  const durationMs = Math.max(cursor, 5_000);
  const hook = (params.hookText?.trim() || 'HOOK HERE').slice(0, 120);
  const hookRestrained =
    hook.length > 40 ? `${hook.slice(0, 37).trimEnd()}…` : hook;

  // Always add hook overlay at 0-3s
  textItems.unshift({
    id: 'tx1',
    text: hookRestrained,
    startMs: 0,
    endMs: Math.min(3_000, durationMs),
    style: { position: 'bottom', fontSize: 36 },
  });

  // If no spokenText captions, add default hook caption
  if (captionItems.length === 0) {
    captionItems.push({
      id: 's1',
      text: hookRestrained,
      startMs: 0,
      endMs: Math.min(3_000, durationMs),
    });
  }

  const audioTrackClips = (params.audioClips ?? []).map((ac, i) => ({
    id: ac.id ?? `a${i + 1}`,
    assetId: ac.assetId,
    srcStartMs: ac.srcStartMs ?? 0,
    srcEndMs: ac.srcEndMs,
    timelineStartMs: ac.timelineStartMs ?? 0,
    label: ac.label ?? 'Background Music',
  }));

  const tracks: EditTimelineJson['tracks'] = [
    {
      id: 'v1',
      type: 'video',
      clips,
    },
    {
      id: 'a1',
      type: 'audio',
      clips: audioTrackClips,
    },
    {
      id: 't1',
      type: 'text',
      items: textItems,
    },
    {
      id: 'cap1',
      type: 'captions',
      items: captionItems,
    },
  ];

  return {
    schemaVersion: '1.0',
    fps: 30,
    durationMs,
    tracks,
    transitions: [],
    meta: {
      generatedBy: 'ai',
      provider: 'sequencer-ai',
      prompt: 'Sequenced clips with audio music and caption/text edit suggestions',
      notes:
        `Sequenced ${clips.length} clip(s). Total duration: ${Math.round(durationMs / 1000)}s.\n\n` +
        `• Audio & Music: Background music track set for ${Math.round(durationMs / 1000)}s. Suggested: Lo-Fi/Corporate Pop @ 120 BPM ducked -14dB under voiceover.\n` +
        `• Captions: Synchronized caption cues for all ${clips.length} clip segments.\n` +
        `• Text: Bold retention hook at 0–3s with scene callout overlays.`,
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
  if (direct.success) {
    const data = direct.data;
    const aTrack = data.tracks.find((t) => t.type === 'audio');
    const fallbackATrack = fallback.tracks.find((t) => t.type === 'audio');
    if (
      aTrack &&
      aTrack.type === 'audio' &&
      aTrack.clips.length === 0 &&
      fallbackATrack &&
      fallbackATrack.type === 'audio' &&
      fallbackATrack.clips.length > 0
    ) {
      return {
        ...data,
        tracks: data.tracks.map((t) =>
          t.type === 'audio' ? { ...t, clips: fallbackATrack.clips } : t,
        ),
      };
    }
    return data;
  }

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

  let rows = await prisma.editTimeline.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: versionInclude,
  });

  if (rows.length === 0) {
    const assets = await loadProjectMediaAssets(workspaceId, projectId);
    const videoAssets = assets.filter((a) => a.type === 'VIDEO');
    const imageAssets = assets.filter((a) => a.type === 'IMAGE');
    const visualAssets = [...videoAssets, ...imageAssets];
    const audioAssets = assets.filter((a) => a.type === 'AUDIO');

    if (visualAssets.length > 0) {
      const script = await prisma.scriptDocument.findFirst({
        where: { projectId },
        orderBy: { updatedAt: 'desc' },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      const scriptContent =
        (script?.versions[0]?.content as Record<string, unknown> | undefined) ?? {};
      const hook =
        typeof scriptContent.hook === 'string'
          ? scriptContent.hook
          : (script?.title ?? 'Main timeline');
      const body = typeof scriptContent.body === 'string' ? scriptContent.body : '';
      const cta = typeof scriptContent.cta === 'string' ? scriptContent.cta : '';
      const rawScenes = Array.isArray(scriptContent.scenes)
        ? (scriptContent.scenes as Array<Record<string, unknown>>)
        : [];

      let clipWindows: Array<{
        startMs: number;
        endMs: number;
        title?: string;
        assetId?: string;
        spokenText?: string;
      }> = [];

      if (rawScenes.length > 0) {
        clipWindows = rawScenes.map((s, idx) => {
          const fulfillment =
            (s.fulfillment as Record<string, unknown> | undefined) ?? {};
          const attachedAssetId =
            (typeof fulfillment.assetId === 'string' && fulfillment.assetId) ||
            visualAssets[idx % Math.max(1, visualAssets.length)]?.id ||
            visualAssets[0]!.id;
          const targetDuration =
            typeof s.targetDurationMs === 'number' && s.targetDurationMs > 0
              ? s.targetDurationMs
              : 5000;
          const assetObj = assets.find((a) => a.id === attachedAssetId);
          const durationMs = assetObj?.durationMs ?? targetDuration;
          const sTitle =
            typeof s.title === 'string' ? s.title : `Scene ${idx + 1}`;
          const spoken =
            typeof s.spokenText === 'string' ? s.spokenText : '';
          return {
            startMs: 0,
            endMs: Math.max(1000, durationMs),
            title: sTitle,
            assetId: attachedAssetId,
            spokenText: spoken,
          };
        });
      } else {
        clipWindows = visualAssets.map((a, idx) => ({
          startMs: 0,
          endMs: Math.max(1000, a.durationMs ?? 5000),
          title: a.name || `Clip ${idx + 1}`,
          assetId: a.id,
          spokenText:
            idx === 0 ? hook : idx === visualAssets.length - 1 ? cta : body,
        }));
      }

      const totalVideoDurationMs = clipWindows.reduce(
        (sum, cw) => sum + (cw.endMs - cw.startMs),
        0,
      );
      const audioClips = audioAssets.map((a, idx) => ({
        id: `aud-${idx + 1}`,
        assetId: a.id,
        srcStartMs: 0,
        srcEndMs: Math.min(
          Math.max(1000, a.durationMs ?? totalVideoDurationMs),
          totalVideoDurationMs,
        ),
        timelineStartMs: 0,
        label: a.name || 'Background Music',
      }));

      const proposalTimeline = mockTimelineJson({
        assetId: visualAssets[0]!.id,
        hookText: hook,
        clipWindows,
        audioClips,
      });

      const sequencedUserTimeline: EditTimelineJson = {
        ...proposalTimeline,
        tracks: [
          proposalTimeline.tracks.find((t) => t.type === 'video')!,
          { id: 'a1', type: 'audio', clips: [] },
          { id: 't1', type: 'text', items: [] },
          { id: 'cap1', type: 'captions', items: [] },
        ],
        meta: {
          generatedBy: 'system',
          notes: `Auto-sequenced ${clipWindows.length} clip(s). Suggestions available for audio & captions.`,
        },
      };

      const timelineId = randomUUID();
      const userVersionId = randomUUID();
      const proposalVersionId = randomUUID();

      await prisma.$transaction(async (tx) => {
        await tx.editTimeline.create({
          data: {
            id: timelineId,
            projectId,
            title: 'Main timeline',
            currentVersionId: userVersionId,
          },
        });
        await tx.timelineVersion.create({
          data: {
            id: userVersionId,
            editTimelineId: timelineId,
            version: 1,
            content: sequencedUserTimeline as Prisma.InputJsonValue,
            source: 'USER',
          },
        });
        await tx.timelineVersion.create({
          data: {
            id: proposalVersionId,
            editTimelineId: timelineId,
            version: 2,
            content: proposalTimeline as Prisma.InputJsonValue,
            source: 'AI_PROPOSAL',
          },
        });
      });

      const createdRow = await prisma.editTimeline.findFirst({
        where: { id: timelineId },
        include: versionInclude,
      });
      if (createdRow) {
        rows = [createdRow];
      }
    }
  }

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

export async function createTimeline(
  workspaceId: string,
  projectId: string,
  input: { title?: string; timeline: unknown },
): Promise<EditTimelineDetailDto> {
  await assertOwnedProject(workspaceId, projectId);
  const parsed = editTimelineJsonSchema.safeParse(input.timeline);
  if (!parsed.success) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      parsed.error.issues.map((i) => i.message).join('; '),
    );
  }

  const timelineId = randomUUID();
  const versionId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.editTimeline.create({
      data: {
        id: timelineId,
        projectId,
        title: input.title ?? 'Main timeline',
        currentVersionId: versionId,
      },
    });
    await tx.timelineVersion.create({
      data: {
        id: versionId,
        editTimelineId: timelineId,
        version: 1,
        content: parsed.data as Prisma.InputJsonValue,
        source: 'USER',
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

function durationMsFromMetadata(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const m = metadata as Record<string, unknown>;
  if (typeof m.durationMs === 'number' && Number.isFinite(m.durationMs)) {
    return Math.max(0, Math.floor(m.durationMs));
  }
  if (typeof m.durationSec === 'number' && Number.isFinite(m.durationSec)) {
    return Math.max(0, Math.floor(m.durationSec * 1000));
  }
  return null;
}

/** Project VIDEO / IMAGE / AUDIO attached for AI script + timeline suggestions. */
export async function loadProjectMediaAssets(
  workspaceId: string,
  projectId: string,
): Promise<
  Array<{
    id: string;
    type: string;
    name: string;
    description: string | null;
    tags: string[];
    durationMs: number | null;
  }>
> {
  const projectAssets = await prisma.projectAsset.findMany({
    where: {
      projectId,
      asset: {
        workspaceId,
        deletedAt: null,
        type: { in: ['VIDEO', 'IMAGE', 'AUDIO'] },
      },
    },
    include: {
      asset: {
        select: {
          id: true,
          type: true,
          name: true,
          description: true,
          tags: true,
          metadata: true,
        },
      },
    },
    orderBy: { attachedAt: 'desc' },
    take: 40,
  });

  return projectAssets.map((pa) => ({
    id: pa.asset.id,
    type: pa.asset.type,
    name: pa.asset.name,
    description: pa.asset.description,
    tags: pa.asset.tags,
    durationMs: durationMsFromMetadata(pa.asset.metadata),
  }));
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
  clipWindows: Array<{
    startMs: number;
    endMs: number;
    title?: string;
    assetId?: string;
    spokenText?: string;
  }>;
  audioClips?: Array<{
    id?: string;
    assetId: string;
    srcStartMs?: number;
    srcEndMs: number;
    timelineStartMs?: number;
    label?: string;
  }>;
  alignments: Array<{
    scriptExcerpt: string;
    startMs: number;
    endMs: number;
    confidence: number;
  }>;
  /** Project VIDEO / IMAGE / AUDIO for Grok asset-aware suggestions. */
  assets: Array<{
    id: string;
    type: string;
    name: string;
    description: string | null;
    tags: string[];
    durationMs: number | null;
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

  const rawScenes = Array.isArray(content.scenes)
    ? (content.scenes as Array<Record<string, unknown>>)
    : [];

  const assets = await loadProjectMediaAssets(workspaceId, projectId);
  const videoAssets = assets.filter((a) => a.type === 'VIDEO');
  const imageAssets = assets.filter((a) => a.type === 'IMAGE');
  const visualAssets = [...videoAssets, ...imageAssets];
  let audioAssets = assets.filter((a) => a.type === 'AUDIO');

  // If project has no audio attached, look in workspace or provision sample audio bed
  if (audioAssets.length === 0) {
    const workspaceAudio = await prisma.asset.findFirst({
      where: { workspaceId, deletedAt: null, type: 'AUDIO' },
      select: {
        id: true,
        type: true,
        name: true,
        description: true,
        tags: true,
        metadata: true,
      },
    });
    if (workspaceAudio) {
      await prisma.projectAsset.upsert({
        where: { projectId_assetId: { projectId, assetId: workspaceAudio.id } },
        create: { projectId, assetId: workspaceAudio.id },
        update: {},
      });
      const meta = (workspaceAudio.metadata as Record<string, unknown>) ?? {};
      const dur =
        typeof meta.durationMs === 'number'
          ? meta.durationMs
          : typeof meta.durationSec === 'number'
            ? Math.round(meta.durationSec * 1000)
            : null;
      audioAssets = [
        {
          id: workspaceAudio.id,
          type: workspaceAudio.type,
          name: workspaceAudio.name,
          description: workspaceAudio.description,
          tags: workspaceAudio.tags,
          durationMs: dur,
        },
      ];
    } else {
      const sampleBedPath = path.join(storage.getRoot(), 'samples', 'dummy-bed.aac');
      const { existsSync, copyFileSync, mkdirSync } = await import('node:fs');
      if (existsSync(sampleBedPath)) {
        const destRel = `workspaces/${workspaceId}/originals/sample-audio-bed/dummy-bed.aac`;
        const destAbs = storage.absoluteFromRelative(destRel);
        mkdirSync(path.dirname(destAbs), { recursive: true });
        copyFileSync(sampleBedPath, destAbs);
        const createdAsset = await prisma.asset.create({
          data: {
            workspaceId,
            name: 'Upbeat Background Track',
            type: 'AUDIO',
            path: destRel,
            mime: 'audio/aac',
            size: 47784,
            tags: ['music', 'background', 'audio-bed'],
            description: 'Default rhythmic background music bed for project sequences',
            metadata: { durationMs: 30000, durationSec: 30 },
          },
        });
        await prisma.projectAsset.upsert({
          where: { projectId_assetId: { projectId, assetId: createdAsset.id } },
          create: { projectId, assetId: createdAsset.id },
          update: {},
        });
        audioAssets = [
          {
            id: createdAsset.id,
            type: createdAsset.type,
            name: createdAsset.name,
            description: createdAsset.description,
            tags: createdAsset.tags,
            durationMs: 30000,
          },
        ];
      }
    }
  }

  let assetId =
    visualAssets[0]?.id ??
    assets.find((a) => a.type === 'VIDEO')?.id ??
    assets.find((a) => a.type === 'IMAGE')?.id;

  if (!assetId) {
    throw new TimelinesHttpError(
      400,
      'validation_error',
      'No video/image asset on project — attach footage or stills before generating timeline',
    );
  }

  let clipWindows: Array<{
    startMs: number;
    endMs: number;
    title?: string;
    assetId?: string;
    spokenText?: string;
  }> = [];

  if (rawScenes.length > 0) {
    clipWindows = rawScenes.map((s, idx) => {
      const fulfillment =
        (s.fulfillment as Record<string, unknown> | undefined) ?? {};
      const attachedAssetId =
        (typeof fulfillment.assetId === 'string' && fulfillment.assetId) ||
        visualAssets[idx % Math.max(1, visualAssets.length)]?.id ||
        assetId;
      const targetDuration =
        typeof s.targetDurationMs === 'number' && s.targetDurationMs > 0
          ? s.targetDurationMs
          : 5000;
      const assetObj = assets.find((a) => a.id === attachedAssetId);
      const durationMs = assetObj?.durationMs ?? targetDuration;
      const sTitle =
        typeof s.title === 'string' ? s.title : `Scene ${idx + 1}`;
      const spoken =
        typeof s.spokenText === 'string' ? s.spokenText : '';
      return {
        startMs: 0,
        endMs: Math.max(1000, durationMs),
        title: sTitle,
        assetId: attachedAssetId,
        spokenText: spoken,
      };
    });
  } else if (visualAssets.length > 0) {
    clipWindows = visualAssets.map((a, idx) => ({
      startMs: 0,
      endMs: Math.max(1000, a.durationMs ?? 5000),
      title: a.name || `Clip ${idx + 1}`,
      assetId: a.id,
      spokenText:
        idx === 0 ? hook : idx === visualAssets.length - 1 ? cta : body,
    }));
  } else {
    clipWindows = [{ startMs: 0, endMs: 5_000, title: 'Intro', assetId, spokenText: hook }];
  }

  let runningMs = 0;
  const alignments = clipWindows.map((cw) => {
    const dur = cw.endMs - cw.startMs;
    const startMs = runningMs;
    const endMs = runningMs + dur;
    runningMs = endMs;
    return {
      scriptExcerpt: cw.spokenText || cw.title || 'Scene',
      startMs,
      endMs,
      confidence: 1.0,
    };
  });

  const totalVideoDurationMs = Math.max(runningMs, 5000);
  const audioClips = audioAssets.map((a, idx) => ({
    id: `aud-${idx + 1}`,
    assetId: a.id,
    srcStartMs: 0,
    srcEndMs: Math.min(Math.max(1000, a.durationMs ?? totalVideoDurationMs), totalVideoDurationMs),
    timelineStartMs: 0,
    label: a.name || 'Background Music',
  }));

  return {
    hook,
    body,
    cta,
    title,
    assetId,
    clipWindows,
    audioClips,
    alignments,
    assets,
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
