import type {
  JobDto,
  JobListQuery,
  JobListResponse,
  MockCompleteJobRequest,
  Platform,
  ScriptContent,
  ScriptSource,
} from '@creatorai/shared';
import { createAiProvider } from '@creatorai/ai-provider';
import type { Job, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import {
  loadScriptContentForAlign,
  mockAlignmentsFromScript,
  mockTranscriptSegments,
  persistAlignments,
  persistTranscript,
} from '../mapping/service';
import { appendAiScriptVersion } from '../scripts/service';
import { enqueueJob } from './queue';

export class JobHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobHttpError';
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function toJobDto(row: Job): JobDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    input: asRecord(row.input),
    output: row.output == null ? null : asRecord(row.output),
    error: row.error,
    progress: row.progress,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findOwnedJob(
  workspaceId: string,
  jobId: string,
): Promise<Job> {
  const row = await prisma.job.findFirst({
    where: { id: jobId, workspaceId },
  });
  if (!row) {
    throw new JobHttpError(404, 'not_found', 'Job not found');
  }
  return row;
}

export async function listJobs(
  workspaceId: string,
  query: JobListQuery,
): Promise<JobListResponse> {
  const where: Prisma.JobWhereInput = { workspaceId };
  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.projectId) where.projectId = query.projectId;

  const rows = await prisma.job.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return { items: rows.map(toJobDto) };
}

export async function getJob(
  workspaceId: string,
  jobId: string,
): Promise<JobDto> {
  const row = await findOwnedJob(workspaceId, jobId);
  return toJobDto(row);
}

export async function retryJob(
  workspaceId: string,
  jobId: string,
): Promise<JobDto> {
  const existing = await findOwnedJob(workspaceId, jobId);
  if (existing.status !== 'FAILED') {
    throw new JobHttpError(
      400,
      'validation_error',
      'Only FAILED jobs can be retried',
    );
  }

  const created = await enqueueJob({
    workspaceId,
    projectId: existing.projectId,
    type: existing.type,
    input: asRecord(existing.input),
  });

  return toJobDto(created);
}

function strField(input: Record<string, unknown>, key: string, fallback: string): string {
  const v = input[key];
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function flattenSupporting(
  byPlatform: Partial<
    Record<string, { titles: string[]; captions: string[]; hashtags: string[] }>
  >,
  platforms: string[],
): Record<string, unknown> {
  const titles: string[] = [];
  const captions: string[] = [];
  const hashtags = new Set<string>();
  for (const p of platforms) {
    const item = byPlatform[p];
    if (!item) continue;
    titles.push(...item.titles);
    captions.push(...item.captions);
    for (const h of item.hashtags) hashtags.add(h);
  }
  // Fallback: flatten all platforms if none matched
  if (titles.length === 0) {
    for (const item of Object.values(byPlatform)) {
      if (!item) continue;
      titles.push(...item.titles);
      captions.push(...item.captions);
      for (const h of item.hashtags) hashtags.add(h);
    }
  }
  return {
    titles,
    captions,
    hashtags: [...hashtags],
    description: null,
  };
}

/**
 * Complete a job with the real AiProvider (mock|openai|gemini).
 * Worker path = write DB directly (docs/jobs/queue.md). Used by poller + mock-complete.
 */
export async function completeJobWithAi(
  jobId: string,
  body: MockCompleteJobRequest = {},
): Promise<JobDto> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new JobHttpError(404, 'not_found', 'Job not found');
  }

  if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
    throw new JobHttpError(
      400,
      'validation_error',
      `Job already ${job.status.toLowerCase()}`,
    );
  }

  if (body.fail) {
    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        progress: 100,
        error: body.error ?? 'Mock failure',
        output: body.output
          ? (body.output as Prisma.InputJsonValue)
          : undefined,
      },
    });
    return toJobDto(updated);
  }

  // Ensure RUNNING (poller may have claimed already)
  if (job.status === 'QUEUED') {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', progress: 50 },
    });
  } else {
    await prisma.job.update({
      where: { id: jobId },
      data: { progress: 50 },
    });
  }

  const input = asRecord(job.input);
  let output: Record<string, unknown> = body.output ? { ...body.output } : {};
  const provider = createAiProvider();

  try {
    if (job.type === 'GENERATE_SCRIPT') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'GENERATE_SCRIPT job missing projectId',
        );
      }
      const generated = await provider.generateScript({
        topic: strField(input, 'topic', 'your topic'),
        audience: strField(input, 'audience', 'creators'),
        tone: strField(input, 'tone', 'practical'),
        platform: strField(input, 'platform', 'YOUTUBE_SHORTS'),
        refineInstruction:
          typeof input.refineInstruction === 'string'
            ? input.refineInstruction
            : undefined,
      });

      const content: ScriptContent = {
        hook: generated.hook,
        body: generated.body,
        cta: generated.cta,
        title: generated.title,
        rawText: generated.fullText,
      };
      const source: ScriptSource = input.refineInstruction
        ? 'REFINE'
        : 'AI';
      const scriptId =
        typeof input.scriptId === 'string' ? input.scriptId : null;
      const title = typeof input.title === 'string' ? input.title : generated.title;

      const result = await appendAiScriptVersion({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        scriptId,
        title,
        content,
        source,
      });

      output = {
        ...output,
        scriptId: result.scriptId,
        versionId: result.versionId,
        version: result.version,
        content,
        provider: generated.provider,
        model: generated.model,
      };
    } else if (job.type === 'GENERATE_HOOKS') {
      const count =
        typeof input.count === 'number' && input.count > 0
          ? Math.min(Math.floor(input.count), 10)
          : 5;
      const scriptText = strField(input, 'scriptText', 'your content');
      const hooks = await provider.generateHooks(scriptText, count);
      output = { ...output, hooks, provider: provider.name };
    } else if (job.type === 'GENERATE_SUPPORTING') {
      const platforms = (
        Array.isArray(input.platforms)
          ? input.platforms.filter((p): p is string => typeof p === 'string')
          : ['YOUTUBE_SHORTS']
      ) as Platform[];
      const scriptText = strField(input, 'scriptText', 'your content');
      const supportingRaw = await provider.generateSupporting(
        scriptText,
        platforms,
      );
      const supporting = flattenSupporting(
        supportingRaw.byPlatform,
        platforms,
      );
      output = {
        ...output,
        supporting,
        byPlatform: supportingRaw.byPlatform,
        provider: supportingRaw.provider,
        model: supportingRaw.model,
      };
    } else if (job.type === 'TRANSCRIBE') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'TRANSCRIBE job missing projectId',
        );
      }
      const assetId = strField(input, 'assetId', '');
      if (!assetId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'TRANSCRIBE job missing assetId',
        );
      }
      const language = strField(input, 'language', 'en');
      const asset = await prisma.asset.findFirst({
        where: {
          id: assetId,
          workspaceId: job.workspaceId,
          deletedAt: null,
        },
        select: { name: true },
      });
      // Phase 6 C will replace mock STT with Whisper; keep deterministic segments for UI/e2e.
      const segments = mockTranscriptSegments(asset?.name);
      const result = await persistTranscript({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        assetId,
        language,
        segments,
      });
      output = {
        ...output,
        transcriptId: result.transcriptId,
        segmentCount: result.segmentCount,
        segments,
        provider: 'mock',
      };
    } else if (job.type === 'ALIGN_SCRIPT') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'ALIGN_SCRIPT job missing projectId',
        );
      }
      const scriptId = strField(input, 'scriptId', '');
      const transcriptId = strField(input, 'transcriptId', '');
      if (!scriptId || !transcriptId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'ALIGN_SCRIPT job missing scriptId or transcriptId',
        );
      }

      const { content } = await loadScriptContentForAlign(
        job.workspaceId,
        scriptId,
      );
      const transcript = await prisma.transcript.findFirst({
        where: {
          id: transcriptId,
          projectId: job.projectId,
          project: { workspaceId: job.workspaceId, deletedAt: null },
        },
        include: { segments: { orderBy: { ordinal: 'asc' } } },
      });
      if (!transcript) {
        throw new JobHttpError(404, 'not_found', 'Transcript not found');
      }

      const segmentInputs = transcript.segments.map((s) => ({
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text,
      }));

      let alignments: {
        scriptRef: string;
        startMs: number;
        endMs: number;
        confidence: number;
      }[];
      let alignProvider = 'mock-fallback';

      try {
        const aiAlignments = await provider.alignScriptToTranscript(
          {
            hook: content.hook,
            body: content.body,
            cta: content.cta,
          },
          segmentInputs,
        );
        alignments = aiAlignments.map((a: {
          scriptExcerpt: string;
          startMs: number;
          endMs: number;
          confidence: number;
        }) => ({
          scriptRef: a.scriptExcerpt,
          startMs: a.startMs,
          endMs: a.endMs,
          confidence: a.confidence,
        }));
        alignProvider = provider.name;
      } catch {
        // Phase 6 C implements real fuzzy align; until then use deterministic mock.
        alignments = mockAlignmentsFromScript(content, segmentInputs);
      }

      const result = await persistAlignments({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        scriptDocumentId: scriptId,
        transcriptId,
        alignments,
      });

      output = {
        ...output,
        mappingIds: result.mappingIds,
        count: result.count,
        alignments,
        provider: alignProvider,
      };
    } else {
      output = {
        ...output,
        message: `No handler for ${job.type}`,
      };
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'SUCCEEDED',
        progress: 100,
        error: null,
        output: output as Prisma.InputJsonValue,
      },
    });
    return toJobDto(updated);
  } catch (err) {
    const message =
      err instanceof JobHttpError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Job complete failed';
    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        progress: 100,
        error: message,
      },
    });
    if (err instanceof JobHttpError) {
      throw err;
    }
    return toJobDto(updated);
  }
}

/**
 * Dev/UI endpoint — same path as the poller (AiProvider + DB writes).
 * Kept for manual forcing / fail injection during demos.
 */
export async function mockCompleteJob(
  workspaceId: string,
  jobId: string,
  body: MockCompleteJobRequest = {},
): Promise<JobDto> {
  await findOwnedJob(workspaceId, jobId);
  return completeJobWithAi(jobId, body);
}
