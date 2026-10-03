import type {
  ClipCandidateDto,
  ClipCandidateListResponse,
  ClipCandidateStatus,
  EnqueueJobResponse,
  PatchClipCandidateRequest,
  ProposeClipsRequest,
  ScriptContent,
} from '@creatorai/shared';
import type { ClipCandidate, ClipCandidateStatus as PrismaClipStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../db/prisma';
import { storage } from '../../storage/local';
import { enqueueJob } from '../jobs/queue';

export class ClipsHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'ClipsHttpError';
  }
}

const STATUS_TO_DTO: Record<PrismaClipStatus, ClipCandidateStatus> = {
  PROPOSED: 'proposed',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  RENDERED: 'rendered',
};

const STATUS_TO_PRISMA: Record<
  'proposed' | 'accepted' | 'rejected',
  PrismaClipStatus
> = {
  proposed: 'PROPOSED',
  accepted: 'ACCEPTED',
  rejected: 'REJECTED',
};

function toClipDto(row: ClipCandidate): ClipCandidateDto {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceAssetId: row.sourceAssetId,
    transcriptId: row.transcriptId,
    scriptDocumentId: row.scriptDocumentId,
    title: row.title,
    startMs: row.startMs,
    endMs: row.endMs,
    score: row.score,
    rationale: row.rationale,
    status: STATUS_TO_DTO[row.status],
    renderedAssetId: row.renderedAssetId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
    throw new ClipsHttpError(404, 'not_found', 'Project not found');
  }
}

async function assertProjectAsset(
  workspaceId: string,
  projectId: string,
  assetId: string,
): Promise<void> {
  const link = await prisma.projectAsset.findFirst({
    where: {
      projectId,
      assetId,
      project: { workspaceId, deletedAt: null },
      asset: { workspaceId, deletedAt: null },
    },
    select: { assetId: true },
  });
  if (!link) {
    throw new ClipsHttpError(
      404,
      'not_found',
      'Asset not found on this project',
    );
  }
}

async function findOwnedCandidate(
  workspaceId: string,
  candidateId: string,
): Promise<ClipCandidate> {
  const row = await prisma.clipCandidate.findFirst({
    where: {
      id: candidateId,
      project: { workspaceId, deletedAt: null },
    },
  });
  if (!row) {
    throw new ClipsHttpError(404, 'not_found', 'Clip candidate not found');
  }
  return row;
}

function parseScriptContent(raw: unknown): ScriptContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { hook: '', body: '', cta: '' };
  }
  const o = raw as Record<string, unknown>;
  return {
    hook: typeof o.hook === 'string' ? o.hook : '',
    body: typeof o.body === 'string' ? o.body : '',
    cta: typeof o.cta === 'string' ? o.cta : '',
    title: typeof o.title === 'string' ? o.title : undefined,
    rawText: typeof o.rawText === 'string' ? o.rawText : undefined,
  };
}

/**
 * Enqueue SCORE_CLIPS for a project (SDD §5.6 propose).
 */
export async function enqueueProposeClips(
  workspaceId: string,
  projectId: string,
  input: ProposeClipsRequest,
): Promise<EnqueueJobResponse> {
  await assertOwnedProject(workspaceId, projectId);

  let transcriptId = input.transcriptId;
  if (transcriptId) {
    const t = await prisma.transcript.findFirst({
      where: {
        id: transcriptId,
        projectId,
        project: { workspaceId, deletedAt: null },
      },
      select: { id: true, assetId: true },
    });
    if (!t) {
      throw new ClipsHttpError(404, 'not_found', 'Transcript not found');
    }
  } else {
    const latest = await prisma.transcript.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, assetId: true },
    });
    if (!latest) {
      throw new ClipsHttpError(
        400,
        'validation_error',
        'No transcript on this project — transcribe footage first',
      );
    }
    transcriptId = latest.id;
  }

  const transcript = await prisma.transcript.findFirstOrThrow({
    where: { id: transcriptId },
    select: { id: true, assetId: true },
  });

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
      throw new ClipsHttpError(404, 'not_found', 'Script not found');
    }
    if (script.versions.length === 0) {
      throw new ClipsHttpError(
        400,
        'validation_error',
        'Script has no versions to score against',
      );
    }
  } else {
    const latest = await prisma.scriptDocument.findFirst({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!latest || latest.versions.length === 0) {
      throw new ClipsHttpError(
        400,
        'validation_error',
        'No script on this project — create/generate a script first',
      );
    }
    scriptId = latest.id;
  }

  const sourceAssetId = input.sourceAssetId ?? transcript.assetId;
  await assertProjectAsset(workspaceId, projectId, sourceAssetId);

  const job = await enqueueJob({
    workspaceId,
    projectId,
    type: 'SCORE_CLIPS',
    input: {
      scriptId,
      transcriptId,
      sourceAssetId,
    },
  });

  return { jobId: job.id };
}

export async function listClipCandidates(
  workspaceId: string,
  projectId: string,
): Promise<ClipCandidateListResponse> {
  await assertOwnedProject(workspaceId, projectId);

  const rows = await prisma.clipCandidate.findMany({
    where: { projectId },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
  });

  return { items: rows.map(toClipDto) };
}

export async function patchClipCandidate(
  workspaceId: string,
  candidateId: string,
  input: PatchClipCandidateRequest,
): Promise<ClipCandidateDto> {
  const existing = await findOwnedCandidate(workspaceId, candidateId);

  if (existing.status === 'RENDERED') {
    throw new ClipsHttpError(
      400,
      'validation_error',
      'Rendered candidates cannot be edited — propose again or tweak before render',
    );
  }

  const startMs = input.startMs ?? existing.startMs;
  const endMs = input.endMs ?? existing.endMs;
  if (endMs <= startMs) {
    throw new ClipsHttpError(
      400,
      'validation_error',
      'endMs must be > startMs',
    );
  }

  let nextStatus: PrismaClipStatus = existing.status;
  if (input.status) {
    nextStatus = STATUS_TO_PRISMA[input.status];
  }

  const updated = await prisma.clipCandidate.update({
    where: { id: candidateId },
    data: {
      title: input.title ?? existing.title,
      startMs,
      endMs,
      status: nextStatus,
    },
  });

  return toClipDto(updated);
}

/**
 * Enqueue RENDER_CLIP for an accepted (or proposed→auto-accept) candidate.
 */
export async function enqueueRenderClip(
  workspaceId: string,
  candidateId: string,
): Promise<EnqueueJobResponse> {
  const candidate = await findOwnedCandidate(workspaceId, candidateId);

  if (candidate.status === 'REJECTED') {
    throw new ClipsHttpError(
      400,
      'validation_error',
      'Rejected candidates cannot be rendered',
    );
  }
  if (candidate.status === 'RENDERED') {
    throw new ClipsHttpError(
      400,
      'validation_error',
      'Candidate already rendered',
    );
  }

  // Accept-on-render for demo convenience when UI skips explicit accept.
  if (candidate.status === 'PROPOSED') {
    await prisma.clipCandidate.update({
      where: { id: candidateId },
      data: { status: 'ACCEPTED' },
    });
  }

  const source = await prisma.asset.findFirst({
    where: {
      id: candidate.sourceAssetId,
      workspaceId,
      deletedAt: null,
    },
    select: { path: true },
  });
  if (!source) {
    throw new ClipsHttpError(404, 'not_found', 'Source asset not found');
  }

  const job = await enqueueJob({
    workspaceId,
    projectId: candidate.projectId,
    type: 'RENDER_CLIP',
    input: {
      candidateId: candidate.id,
      sourceAssetId: candidate.sourceAssetId,
      inputPath: source.path,
      startMs: candidate.startMs,
      endMs: candidate.endMs,
      title: candidate.title,
    },
  });

  return { jobId: job.id };
}

export type PersistClipIdeaInput = {
  startMs: number;
  endMs: number;
  score: number;
  titleSuggestion: string;
  rationale?: string;
};

/**
 * Replace PROPOSED candidates for a project+sourceAsset after SCORE_CLIPS.
 * Keeps ACCEPTED / REJECTED / RENDERED rows.
 */
export async function persistClipCandidates(params: {
  workspaceId: string;
  projectId: string;
  sourceAssetId: string;
  transcriptId?: string | null;
  scriptDocumentId?: string | null;
  ideas: PersistClipIdeaInput[];
}): Promise<{ candidateIds: string[]; count: number }> {
  await assertOwnedProject(params.workspaceId, params.projectId);
  await assertProjectAsset(
    params.workspaceId,
    params.projectId,
    params.sourceAssetId,
  );

  const rows = params.ideas.map((idea) => ({
    projectId: params.projectId,
    sourceAssetId: params.sourceAssetId,
    transcriptId: params.transcriptId ?? null,
    scriptDocumentId: params.scriptDocumentId ?? null,
    title: (idea.titleSuggestion || 'Clip').slice(0, 255),
    startMs: Math.max(0, Math.floor(idea.startMs)),
    endMs: Math.max(0, Math.floor(idea.endMs)),
    score: Math.min(1, Math.max(0, idea.score)),
    rationale: idea.rationale?.slice(0, 4000) ?? null,
    status: 'PROPOSED' as const,
  }));

  for (const r of rows) {
    if (r.endMs <= r.startMs) {
      throw new ClipsHttpError(
        400,
        'validation_error',
        'Each clip idea must have endMs > startMs',
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.clipCandidate.deleteMany({
      where: {
        projectId: params.projectId,
        sourceAssetId: params.sourceAssetId,
        status: 'PROPOSED',
      },
    });
    if (rows.length === 0) return [];
    await tx.clipCandidate.createMany({ data: rows });
    return tx.clipCandidate.findMany({
      where: {
        projectId: params.projectId,
        sourceAssetId: params.sourceAssetId,
        status: 'PROPOSED',
      },
      orderBy: { score: 'desc' },
      select: { id: true },
    });
  });

  return {
    candidateIds: created.map((r) => r.id),
    count: created.length,
  };
}

/**
 * After RENDER_CLIP: register rendered MP4 as Asset, link to candidate, attach to project.
 */
export async function persistRenderedClip(params: {
  workspaceId: string;
  projectId: string;
  candidateId: string;
  /** Absolute or storage-relative path to rendered MP4. */
  outputPath: string;
  jobId: string;
}): Promise<{ assetId: string; relativePath: string }> {
  await assertOwnedProject(params.workspaceId, params.projectId);
  const candidate = await findOwnedCandidate(
    params.workspaceId,
    params.candidateId,
  );
  if (candidate.projectId !== params.projectId) {
    throw new ClipsHttpError(
      400,
      'validation_error',
      'Candidate does not belong to this project',
    );
  }

  const storageRoot = path.resolve(storage.getRoot());
  let absoluteOut = params.outputPath;
  if (!path.isAbsolute(absoluteOut)) {
    absoluteOut = path.resolve(absoluteOut);
  }
  // Prefer path under storage root as relative; otherwise re-home under renders/.
  let relativePath: string;
  if (
    absoluteOut === storageRoot ||
    absoluteOut.startsWith(storageRoot + path.sep)
  ) {
    relativePath = path.relative(storageRoot, absoluteOut).split(path.sep).join('/');
  } else {
    relativePath = path.posix.join(
      'workspaces',
      params.workspaceId,
      'renders',
      params.jobId,
      'output.mp4',
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
    throw new ClipsHttpError(
      500,
      'internal_error',
      `Rendered file missing: ${absoluteOut}`,
    );
  }

  const assetId = randomUUID();
  const safeTitle = (candidate.title || 'clip').replace(/[^\w.\-()+ ]+/g, '_');
  const displayName = `${safeTitle.slice(0, 180)}.mp4`;

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
        tags: ['clip', 'rendered'],
        description: `Rendered clip from candidate ${candidate.id}`,
        metadata: {
          clipCandidateId: candidate.id,
          sourceAssetId: candidate.sourceAssetId,
          startMs: candidate.startMs,
          endMs: candidate.endMs,
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

    await tx.clipCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'RENDERED',
        renderedAssetId: assetId,
      },
    });
  });

  return { assetId, relativePath };
}

/** Deterministic fallback when AiProvider.scoreClipWindows fails. */
export function mockClipIdeas(params?: {
  durationMs?: number;
  scriptTitle?: string;
}): PersistClipIdeaInput[] {
  const duration = Math.max(params?.durationMs ?? 60_000, 45_000);
  const label = params?.scriptTitle?.trim() || 'Batch clip';
  const windows: PersistClipIdeaInput[] = [
    {
      startMs: 0,
      endMs: Math.min(20_000, duration),
      score: 0.92,
      titleSuggestion: `${label} — Hook`,
      rationale: 'Strong opening window (mock scorer)',
    },
    {
      startMs: Math.min(12_000, Math.max(0, duration - 30_000)),
      endMs: Math.min(12_000 + 23_000, duration),
      score: 0.81,
      titleSuggestion: `${label} — Mid tip`,
      rationale: 'Mid-body cue window (mock scorer)',
    },
    {
      startMs: Math.max(0, duration - 25_000),
      endMs: duration,
      score: 0.74,
      titleSuggestion: `${label} — CTA`,
      rationale: 'Closing CTA window (mock scorer)',
    },
  ];
  return windows.filter((w) => w.endMs > w.startMs).slice(0, 3);
}

export async function loadScriptAndTranscriptForScore(
  workspaceId: string,
  scriptId: string,
  transcriptId: string,
): Promise<{
  projectId: string;
  content: ScriptContent;
  segments: { startMs: number; endMs: number; text: string }[];
  language: string;
  sourceAssetId: string;
}> {
  const script = await prisma.scriptDocument.findFirst({
    where: {
      id: scriptId,
      project: { workspaceId, deletedAt: null },
    },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
  if (!script || script.versions.length === 0) {
    throw new ClipsHttpError(404, 'not_found', 'Script not found');
  }

  const transcript = await prisma.transcript.findFirst({
    where: {
      id: transcriptId,
      project: { workspaceId, deletedAt: null },
    },
    include: { segments: { orderBy: { ordinal: 'asc' } } },
  });
  if (!transcript) {
    throw new ClipsHttpError(404, 'not_found', 'Transcript not found');
  }
  if (transcript.projectId !== script.projectId) {
    throw new ClipsHttpError(
      400,
      'validation_error',
      'Script and transcript belong to different projects',
    );
  }

  return {
    projectId: script.projectId,
    content: parseScriptContent(script.versions[0]!.content),
    segments: transcript.segments.map((s) => ({
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
    })),
    language: transcript.language,
    sourceAssetId: transcript.assetId,
  };
}
