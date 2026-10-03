import type {
  AlignScriptRequest,
  EnqueueJobResponse,
  MappingListResponse,
  PatchMappingRequest,
  ScriptContent,
  ScriptFootageMapDto,
  TranscriptDetailDto,
  TranscriptListResponse,
  TranscriptSegmentDto,
  TranscribeRequest,
} from '@creatorai/shared';
import { LOW_CONFIDENCE_THRESHOLD } from '@creatorai/shared';
import type {
  ScriptFootageMap,
  Transcript,
  TranscriptSegment,
} from '@prisma/client';
import { prisma } from '../../db/prisma';
import { enqueueJob } from '../jobs/queue';

export class MappingHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'MappingHttpError';
  }
}

function toSegmentDto(row: TranscriptSegment): TranscriptSegmentDto {
  return {
    id: row.id,
    transcriptId: row.transcriptId,
    ordinal: row.ordinal,
    startMs: row.startMs,
    endMs: row.endMs,
    text: row.text,
  };
}

function toTranscriptDetailDto(
  row: Transcript & { segments: TranscriptSegment[] },
): TranscriptDetailDto {
  const segments = [...row.segments].sort((a, b) => a.ordinal - b.ordinal);
  return {
    id: row.id,
    projectId: row.projectId,
    assetId: row.assetId,
    language: row.language,
    segmentCount: segments.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    segments: segments.map(toSegmentDto),
  };
}

function toMappingDto(row: ScriptFootageMap): ScriptFootageMapDto {
  const source = row.source === 'USER' ? 'USER' : 'AI';
  return {
    id: row.id,
    projectId: row.projectId,
    transcriptId: row.transcriptId,
    scriptDocumentId: row.scriptDocumentId,
    scriptRef: row.scriptRef,
    startMs: row.startMs,
    endMs: row.endMs,
    confidence: row.confidence,
    source,
    lowConfidence: row.confidence < LOW_CONFIDENCE_THRESHOLD,
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
    throw new MappingHttpError(404, 'not_found', 'Project not found');
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
    throw new MappingHttpError(
      404,
      'not_found',
      'Asset not found on this project',
    );
  }
}

async function findOwnedTranscript(
  workspaceId: string,
  transcriptId: string,
): Promise<Transcript & { segments: TranscriptSegment[] }> {
  const row = await prisma.transcript.findFirst({
    where: {
      id: transcriptId,
      project: { workspaceId, deletedAt: null },
    },
    include: { segments: { orderBy: { ordinal: 'asc' } } },
  });
  if (!row) {
    throw new MappingHttpError(404, 'not_found', 'Transcript not found');
  }
  return row;
}

async function findOwnedMapping(
  workspaceId: string,
  mappingId: string,
): Promise<ScriptFootageMap> {
  const row = await prisma.scriptFootageMap.findFirst({
    where: {
      id: mappingId,
      project: { workspaceId, deletedAt: null },
    },
  });
  if (!row) {
    throw new MappingHttpError(404, 'not_found', 'Mapping not found');
  }
  return row;
}

export async function enqueueTranscribe(
  workspaceId: string,
  projectId: string,
  input: TranscribeRequest,
): Promise<EnqueueJobResponse> {
  await assertOwnedProject(workspaceId, projectId);
  await assertProjectAsset(workspaceId, projectId, input.assetId);

  const job = await enqueueJob({
    workspaceId,
    projectId,
    type: 'TRANSCRIBE',
    input: {
      assetId: input.assetId,
      language: input.language ?? 'en',
    },
  });

  return { jobId: job.id };
}

export async function listTranscripts(
  workspaceId: string,
  projectId: string,
): Promise<TranscriptListResponse> {
  await assertOwnedProject(workspaceId, projectId);

  const rows = await prisma.transcript.findMany({
    where: { projectId },
    include: { segments: { orderBy: { ordinal: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });

  return { items: rows.map(toTranscriptDetailDto) };
}

export async function enqueueAlignScript(
  workspaceId: string,
  projectId: string,
  input: AlignScriptRequest,
): Promise<EnqueueJobResponse> {
  await assertOwnedProject(workspaceId, projectId);

  const script = await prisma.scriptDocument.findFirst({
    where: {
      id: input.scriptId,
      projectId,
      project: { workspaceId, deletedAt: null },
    },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
  if (!script) {
    throw new MappingHttpError(404, 'not_found', 'Script not found');
  }
  if (script.versions.length === 0) {
    throw new MappingHttpError(
      400,
      'validation_error',
      'Script has no versions to align',
    );
  }

  let transcriptId = input.transcriptId;
  if (transcriptId) {
    const t = await findOwnedTranscript(workspaceId, transcriptId);
    if (t.projectId !== projectId) {
      throw new MappingHttpError(
        400,
        'validation_error',
        'Transcript does not belong to this project',
      );
    }
  } else {
    const latest = await prisma.transcript.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!latest) {
      throw new MappingHttpError(
        400,
        'validation_error',
        'No transcript on this project — transcribe footage first',
      );
    }
    transcriptId = latest.id;
  }

  const job = await enqueueJob({
    workspaceId,
    projectId,
    type: 'ALIGN_SCRIPT',
    input: {
      scriptId: input.scriptId,
      transcriptId,
    },
  });

  return { jobId: job.id };
}

export async function listMappings(
  workspaceId: string,
  projectId: string,
): Promise<MappingListResponse> {
  await assertOwnedProject(workspaceId, projectId);

  const rows = await prisma.scriptFootageMap.findMany({
    where: { projectId },
    orderBy: [{ startMs: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    items: rows.map(toMappingDto),
    lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
  };
}

export async function patchMapping(
  workspaceId: string,
  mappingId: string,
  input: PatchMappingRequest,
): Promise<ScriptFootageMapDto> {
  const existing = await findOwnedMapping(workspaceId, mappingId);

  const startMs = input.startMs ?? existing.startMs;
  const endMs = input.endMs ?? existing.endMs;
  if (endMs < startMs) {
    throw new MappingHttpError(
      400,
      'validation_error',
      'endMs must be >= startMs',
    );
  }

  const updated = await prisma.scriptFootageMap.update({
    where: { id: mappingId },
    data: {
      scriptRef: input.scriptRef ?? existing.scriptRef,
      startMs,
      endMs,
      confidence: input.confidence ?? existing.confidence,
      source: 'USER',
    },
  });

  return toMappingDto(updated);
}

export type PersistSegmentInput = {
  startMs: number;
  endMs: number;
  text: string;
};

/**
 * Upsert path for TRANSCRIBE job completion (poller / worker / mock).
 * Replaces any prior transcript for the same project+asset.
 */
export async function persistTranscript(params: {
  workspaceId: string;
  projectId: string;
  assetId: string;
  language?: string;
  segments: PersistSegmentInput[];
}): Promise<{ transcriptId: string; segmentCount: number }> {
  await assertOwnedProject(params.workspaceId, params.projectId);
  await assertProjectAsset(
    params.workspaceId,
    params.projectId,
    params.assetId,
  );

  const language = params.language?.trim() || 'en';
  const segments = params.segments.map((s, i) => ({
    ordinal: i,
    startMs: Math.max(0, Math.floor(s.startMs)),
    endMs: Math.max(0, Math.floor(s.endMs)),
    text: s.text,
  }));

  const transcript = await prisma.$transaction(async (tx) => {
    await tx.transcript.deleteMany({
      where: { projectId: params.projectId, assetId: params.assetId },
    });

    return tx.transcript.create({
      data: {
        projectId: params.projectId,
        assetId: params.assetId,
        language,
        segments: {
          create: segments,
        },
      },
    });
  });

  return { transcriptId: transcript.id, segmentCount: segments.length };
}

export type PersistAlignmentInput = {
  scriptRef: string;
  startMs: number;
  endMs: number;
  confidence: number;
};

/**
 * Replace AI mappings for a script+transcript pair (ALIGN_SCRIPT completion).
 * Preserves USER-corrected rows that share the same scriptDocumentId+transcriptId
 * only if Integration later wants merge — MVP: replace all for that pair.
 */
export async function persistAlignments(params: {
  workspaceId: string;
  projectId: string;
  scriptDocumentId: string;
  transcriptId: string;
  alignments: PersistAlignmentInput[];
}): Promise<{ mappingIds: string[]; count: number }> {
  await assertOwnedProject(params.workspaceId, params.projectId);
  await findOwnedTranscript(params.workspaceId, params.transcriptId);

  const script = await prisma.scriptDocument.findFirst({
    where: {
      id: params.scriptDocumentId,
      projectId: params.projectId,
      project: { workspaceId: params.workspaceId, deletedAt: null },
    },
    select: { id: true },
  });
  if (!script) {
    throw new MappingHttpError(404, 'not_found', 'Script not found');
  }

  const rows = params.alignments.map((a) => ({
    projectId: params.projectId,
    transcriptId: params.transcriptId,
    scriptDocumentId: params.scriptDocumentId,
    scriptRef: a.scriptRef,
    startMs: Math.max(0, Math.floor(a.startMs)),
    endMs: Math.max(0, Math.floor(a.endMs)),
    confidence: Math.min(1, Math.max(0, a.confidence)),
    source: 'AI',
  }));

  const created = await prisma.$transaction(async (tx) => {
    await tx.scriptFootageMap.deleteMany({
      where: {
        projectId: params.projectId,
        scriptDocumentId: params.scriptDocumentId,
        transcriptId: params.transcriptId,
      },
    });
    if (rows.length === 0) return [];
    await tx.scriptFootageMap.createMany({ data: rows });
    return tx.scriptFootageMap.findMany({
      where: {
        projectId: params.projectId,
        scriptDocumentId: params.scriptDocumentId,
        transcriptId: params.transcriptId,
      },
      orderBy: { startMs: 'asc' },
      select: { id: true },
    });
  });

  return {
    mappingIds: created.map((r) => r.id),
    count: created.length,
  };
}

/** Deterministic mock STT until Whisper is wired — timings fit media length. */
export function mockTranscriptSegments(
  assetName?: string,
  durationMs?: number,
): PersistSegmentInput[] {
  const label = assetName?.trim() || 'footage';
  const base: PersistSegmentInput[] = [
    {
      startMs: 0,
      endMs: 4000,
      text: `Stop filming one Reel a day — here's how I batch from ${label}.`,
    },
    {
      startMs: 4000,
      endMs: 12000,
      text: 'First, pick one topic cluster for the week. Mine this week: batching short-form video.',
    },
    {
      startMs: 12000,
      endMs: 20000,
      text: 'Second, write three hooks before you touch the camera.',
    },
    {
      startMs: 20000,
      endMs: 30000,
      text: 'Third, film all A-roll in one session: same outfit, same lighting, same mic.',
    },
    {
      startMs: 30000,
      endMs: 42000,
      text: 'Fourth, dump everything into one project and let AI map your takes.',
    },
    {
      startMs: 42000,
      endMs: 52000,
      text: 'If you want the checklist, save this Reel and comment BATCH.',
    },
  ];

  const target =
    typeof durationMs === 'number' &&
    Number.isFinite(durationMs) &&
    durationMs > 0
      ? Math.floor(durationMs)
      : null;
  if (target == null) return base;

  const sourceEnd = base[base.length - 1]!.endMs;
  if (sourceEnd <= 0) return base;

  return base.map((seg, i) => {
    const startMs = Math.round((seg.startMs / sourceEnd) * target);
    const endMs =
      i === base.length - 1
        ? target
        : Math.max(startMs + 1, Math.round((seg.endMs / sourceEnd) * target));
    return { ...seg, startMs, endMs };
  });
}

function parseScriptContent(raw: unknown): ScriptContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { hook: '', body: '', cta: '' };
  }
  const o = raw as Record<string, unknown>;
  const scenes = Array.isArray(o.scenes) ? (o.scenes as ScriptContent['scenes']) : undefined;
  return {
    hook: typeof o.hook === 'string' ? o.hook : '',
    body: typeof o.body === 'string' ? o.body : '',
    cta: typeof o.cta === 'string' ? o.cta : '',
    title: typeof o.title === 'string' ? o.title : undefined,
    rawText: typeof o.rawText === 'string' ? o.rawText : undefined,
    ...(scenes && scenes.length > 0 ? { scenes } : {}),
  };
}

/**
 * Fallback aligner when AiProvider.alignScriptToTranscript is not ready.
 * Splits hook / body paragraphs / CTA across transcript duration.
 */
export function mockAlignmentsFromScript(
  content: ScriptContent,
  segments: PersistSegmentInput[],
): PersistAlignmentInput[] {
  const lastEnd =
    segments.length > 0 ? segments[segments.length - 1]!.endMs : 60000;
  const bodyParts = content.body
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sections: { ref: string; weight: number }[] = [
    { ref: content.hook || 'Hook', weight: 1 },
    ...bodyParts.map((p, i) => ({
      ref: p.slice(0, 120) || `Body ${i + 1}`,
      weight: 1,
    })),
    { ref: content.cta || 'CTA', weight: 1 },
  ];
  const totalWeight = sections.reduce((s, x) => s + x.weight, 0) || 1;

  let cursor = 0;
  return sections.map((sec, i) => {
    const span = Math.floor((lastEnd * sec.weight) / totalWeight);
    const startMs = cursor;
    const endMs =
      i === sections.length - 1 ? lastEnd : Math.min(lastEnd, cursor + span);
    cursor = endMs;
    // Mid-list body lines get slightly lower confidence to exercise UI highlight.
    const confidence =
      i === 0 ? 0.92 : i === sections.length - 1 ? 0.88 : i === 2 ? 0.42 : 0.78;
    return {
      scriptRef: sec.ref,
      startMs,
      endMs: Math.max(startMs, endMs),
      confidence,
    };
  });
}

export async function loadScriptContentForAlign(
  workspaceId: string,
  scriptId: string,
): Promise<{ projectId: string; content: ScriptContent }> {
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
    throw new MappingHttpError(404, 'not_found', 'Script not found');
  }
  return {
    projectId: script.projectId,
    content: parseScriptContent(script.versions[0]!.content),
  };
}
