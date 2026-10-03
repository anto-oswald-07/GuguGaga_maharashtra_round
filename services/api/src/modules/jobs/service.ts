import type {
  JobDto,
  JobListQuery,
  JobListResponse,
  MockCompleteJobRequest,
  ScriptContent,
  ScriptSource,
} from '@creatorai/shared';
import type { Job, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
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

function mockScriptContent(input: Record<string, unknown>): ScriptContent {
  const topic =
    typeof input.topic === 'string' && input.topic.trim()
      ? input.topic.trim()
      : 'your topic';
  const audience =
    typeof input.audience === 'string' && input.audience.trim()
      ? input.audience.trim()
      : 'creators';
  const tone =
    typeof input.tone === 'string' && input.tone.trim()
      ? input.tone.trim()
      : 'clear';
  const refine =
    typeof input.refineInstruction === 'string' && input.refineInstruction
      ? input.refineInstruction
      : null;

  const hook = refine
    ? `Refined hook for ${topic}: ${refine.slice(0, 120)}`
    : `Stop scrolling — here's the fastest way to nail ${topic}.`;

  const body = [
    `This is a mock AI script about ${topic}.`,
    `Written for ${audience} in a ${tone} tone.`,
    refine ? `Refine note applied: ${refine}` : 'Beat 1: set the problem.',
    'Beat 2: show the simple system.',
    'Beat 3: prove it with one concrete example.',
  ].join('\n\n');

  const cta = `If this helped, save it and comment your #1 blocker on ${topic}.`;

  return {
    hook,
    body,
    cta,
    title: typeof input.title === 'string' ? input.title : `Script: ${topic}`,
    rawText: `## Hook\n\n${hook}\n\n## Body\n\n${body}\n\n## CTA\n\n${cta}`,
  };
}

function mockHooks(input: Record<string, unknown>): string[] {
  const count =
    typeof input.count === 'number' && input.count > 0
      ? Math.min(Math.floor(input.count), 10)
      : 5;
  const base =
    typeof input.scriptText === 'string' && input.scriptText
      ? input.scriptText.slice(0, 40)
      : 'your content';
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return `Hook ${n}: What if ${base.trim()}… actually took half the time? (${n})`;
  });
}

function mockSupporting(input: Record<string, unknown>): Record<string, unknown> {
  const platforms = Array.isArray(input.platforms)
    ? input.platforms.filter((p): p is string => typeof p === 'string')
    : ['TIKTOK'];
  return {
    titles: platforms.map((p) => `[${p}] Mock title for your script`),
    captions: platforms.map(
      (p) => `Mock caption for ${p} — punchy, on-brand, under 150 chars.`,
    ),
    hashtags: ['#CreatorAi', '#ContentOps', '#ShortForm'],
    description: 'Mock long-form description generated for supporting content.',
  };
}

/**
 * Dev/UI testing helper until Arvin's worker consumer lands.
 * Simulates worker: QUEUED|RUNNING → SUCCEEDED (or FAILED), writes ScriptVersion for GENERATE_SCRIPT.
 *
 * **Decision:** Worker will write DB directly (same path as this function).
 * No separate internal webhook required for MVP — see `docs/jobs/queue.md`.
 */
export async function mockCompleteJob(
  workspaceId: string,
  jobId: string,
  body: MockCompleteJobRequest = {},
): Promise<JobDto> {
  const job = await findOwnedJob(workspaceId, jobId);

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

  // Claim → running
  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'RUNNING', progress: 50 },
  });

  const input = asRecord(job.input);
  let output: Record<string, unknown> = body.output ? { ...body.output } : {};

  try {
    if (job.type === 'GENERATE_SCRIPT') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'GENERATE_SCRIPT job missing projectId',
        );
      }
      const content = mockScriptContent(input);
      const source: ScriptSource = input.refineInstruction
        ? 'REFINE'
        : 'AI';
      const scriptId =
        typeof input.scriptId === 'string' ? input.scriptId : null;
      const title = typeof input.title === 'string' ? input.title : null;

      const result = await appendAiScriptVersion({
        workspaceId,
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
      };
    } else if (job.type === 'GENERATE_HOOKS') {
      output = { ...output, hooks: mockHooks(input) };
    } else if (job.type === 'GENERATE_SUPPORTING') {
      output = { ...output, supporting: mockSupporting(input) };
    } else {
      output = {
        ...output,
        message: `Mock complete for ${job.type} (no artifact writer yet)`,
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
          : 'Mock complete failed';
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
