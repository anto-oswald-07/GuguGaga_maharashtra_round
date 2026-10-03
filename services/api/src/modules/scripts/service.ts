import type {
  CreateScriptRequest,
  CreateScriptVersionRequest,
  EnqueueJobResponse,
  GenerateHooksRequest,
  GenerateScriptRequest,
  GenerateSupportingRequest,
  Platform,
  RefineScriptRequest,
  ScriptContent,
  ScriptDocumentDetailDto,
  ScriptDocumentDto,
  ScriptListResponse,
  ScriptSource,
  ScriptVersionDto,
} from '@creatorai/shared';
import type {
  Prisma,
  ScriptDocument,
  ScriptSource as PrismaScriptSource,
  ScriptVersion,
} from '@prisma/client';
import { prisma } from '../../db/prisma';
import { enqueueJob } from '../jobs/queue';

export class ScriptHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'ScriptHttpError';
  }
}

function parseContent(raw: unknown): ScriptContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { hook: '', body: '', cta: '' };
  }
  const o = raw as Record<string, unknown>;
  return {
    hook: typeof o.hook === 'string' ? o.hook : '',
    body: typeof o.body === 'string' ? o.body : '',
    cta: typeof o.cta === 'string' ? o.cta : '',
    ...(typeof o.title === 'string' ? { title: o.title } : {}),
    ...(typeof o.rawText === 'string' ? { rawText: o.rawText } : {}),
  };
}

function toVersionDto(row: ScriptVersion): ScriptVersionDto {
  return {
    id: row.id,
    scriptDocumentId: row.scriptDocumentId,
    version: row.version,
    content: parseContent(row.content),
    source: row.source as ScriptSource,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDocumentDto(
  row: ScriptDocument & { versions: ScriptVersion[] },
  versionCount?: number,
): ScriptDocumentDto {
  const latest = row.versions[0] ?? null;
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    latestVersion: latest ? toVersionDto(latest) : null,
    versionCount: versionCount ?? row.versions.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const latestVersionInclude = {
  versions: {
    orderBy: { version: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.ScriptDocumentInclude;

async function assertOwnedProject(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    throw new ScriptHttpError(404, 'not_found', 'Project not found');
  }
}

async function findOwnedScript(
  workspaceId: string,
  scriptId: string,
): Promise<ScriptDocument & { versions: ScriptVersion[] }> {
  const row = await prisma.scriptDocument.findFirst({
    where: {
      id: scriptId,
      project: { workspaceId, deletedAt: null },
    },
    include: {
      versions: { orderBy: { version: 'desc' } },
    },
  });
  if (!row) {
    throw new ScriptHttpError(404, 'not_found', 'Script not found');
  }
  return row;
}

export async function createScript(
  workspaceId: string,
  projectId: string,
  input: CreateScriptRequest,
): Promise<ScriptDocumentDetailDto> {
  await assertOwnedProject(workspaceId, projectId);

  const row = await prisma.$transaction(async (tx) => {
    const doc = await tx.scriptDocument.create({
      data: {
        projectId,
        title: input.title ?? null,
      },
    });

    await tx.scriptVersion.create({
      data: {
        scriptDocumentId: doc.id,
        version: 1,
        content: input.content as Prisma.InputJsonValue,
        source: (input.source ?? 'USER') as PrismaScriptSource,
      },
    });

    return tx.scriptDocument.findUniqueOrThrow({
      where: { id: doc.id },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
  });

  return {
    ...toDocumentDto(row, row.versions.length),
    versions: row.versions.map(toVersionDto),
  };
}

export async function listScripts(
  workspaceId: string,
  projectId: string,
): Promise<ScriptListResponse> {
  await assertOwnedProject(workspaceId, projectId);

  const rows = await prisma.scriptDocument.findMany({
    where: { projectId },
    include: latestVersionInclude,
    orderBy: { updatedAt: 'desc' },
  });

  const counts = await prisma.scriptVersion.groupBy({
    by: ['scriptDocumentId'],
    where: { scriptDocumentId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const countMap = new Map(
    counts.map((c) => [c.scriptDocumentId, c._count._all]),
  );

  return {
    items: rows.map((r) => toDocumentDto(r, countMap.get(r.id) ?? 0)),
  };
}

export async function getScript(
  workspaceId: string,
  scriptId: string,
): Promise<ScriptDocumentDetailDto> {
  const row = await findOwnedScript(workspaceId, scriptId);
  // versions already desc; reverse for chronological list
  const chronological = [...row.versions].reverse();
  return {
    ...toDocumentDto(row, row.versions.length),
    versions: chronological.map(toVersionDto),
  };
}

export async function createScriptVersion(
  workspaceId: string,
  scriptId: string,
  input: CreateScriptVersionRequest,
): Promise<ScriptVersionDto> {
  const existing = await findOwnedScript(workspaceId, scriptId);
  const nextVersion =
    existing.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;

  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.scriptVersion.create({
      data: {
        scriptDocumentId: scriptId,
        version: nextVersion,
        content: input.content as Prisma.InputJsonValue,
        source: (input.source ?? 'USER') as PrismaScriptSource,
      },
    });
    await tx.scriptDocument.update({
      where: { id: scriptId },
      data: { updatedAt: new Date() },
    });
    return created;
  });

  return toVersionDto(version);
}

export async function enqueueGenerateScript(
  workspaceId: string,
  projectId: string,
  input: GenerateScriptRequest,
): Promise<EnqueueJobResponse> {
  await assertOwnedProject(workspaceId, projectId);

  if (input.scriptId) {
    await findOwnedScript(workspaceId, input.scriptId);
  }

  const job = await enqueueJob({
    workspaceId,
    projectId,
    type: 'GENERATE_SCRIPT',
    input: {
      topic: input.topic,
      audience: input.audience,
      tone: input.tone,
      platform: input.platform,
      scriptId: input.scriptId ?? null,
      refineInstruction: input.refineInstruction ?? null,
      title: input.title ?? null,
    },
  });

  return { jobId: job.id };
}

export async function enqueueGenerateHooks(
  workspaceId: string,
  scriptId: string,
  input: GenerateHooksRequest,
): Promise<EnqueueJobResponse> {
  const script = await findOwnedScript(workspaceId, scriptId);
  const latest = script.versions[0];
  if (!latest) {
    throw new ScriptHttpError(
      400,
      'validation_error',
      'Script has no versions to generate hooks from',
    );
  }

  const content = parseContent(latest.content);
  const job = await enqueueJob({
    workspaceId,
    projectId: script.projectId,
    type: 'GENERATE_HOOKS',
    input: {
      scriptId,
      count: input.count ?? 5,
      scriptText: [content.hook, content.body, content.cta].join('\n\n'),
    },
  });

  return { jobId: job.id };
}

export async function enqueueGenerateSupporting(
  workspaceId: string,
  scriptId: string,
  input: GenerateSupportingRequest,
): Promise<EnqueueJobResponse> {
  const script = await findOwnedScript(workspaceId, scriptId);
  const latest = script.versions[0];
  if (!latest) {
    throw new ScriptHttpError(
      400,
      'validation_error',
      'Script has no versions to generate supporting content from',
    );
  }

  const content = parseContent(latest.content);
  const job = await enqueueJob({
    workspaceId,
    projectId: script.projectId,
    type: 'GENERATE_SUPPORTING',
    input: {
      scriptId,
      platforms: input.platforms,
      scriptText: [content.hook, content.body, content.cta].join('\n\n'),
    },
  });

  return { jobId: job.id };
}

/**
 * Refine = GENERATE_SCRIPT job with scriptId + refineInstruction.
 * Reuses prior generate params from the last successful job when available.
 */
export async function enqueueRefineScript(
  workspaceId: string,
  scriptId: string,
  input: RefineScriptRequest,
): Promise<EnqueueJobResponse> {
  const script = await findOwnedScript(workspaceId, scriptId);
  const latest = script.versions[0];
  if (!latest) {
    throw new ScriptHttpError(
      400,
      'validation_error',
      'Script has no versions to refine',
    );
  }

  const content = parseContent(latest.content);
  const project = await prisma.project.findFirst({
    where: { id: script.projectId, workspaceId, deletedAt: null },
    select: { targetPlatforms: true },
  });
  const platform =
    (project?.targetPlatforms?.[0] as Platform | undefined) ?? 'YOUTUBE_SHORTS';

  // Best-effort: recover topic/audience/tone from last script job for this document
  const prior = await prisma.job.findFirst({
    where: {
      workspaceId,
      projectId: script.projectId,
      type: 'GENERATE_SCRIPT',
      status: 'SUCCEEDED',
    },
    orderBy: { createdAt: 'desc' },
  });
  const priorInput = prior ? (prior.input as Record<string, unknown>) : {};
  const topic =
    (typeof priorInput.topic === 'string' && priorInput.topic) ||
    script.title ||
    content.title ||
    content.hook.slice(0, 120) ||
    'script';
  const audience =
    (typeof priorInput.audience === 'string' && priorInput.audience) ||
    'creators';
  const tone =
    (typeof priorInput.tone === 'string' && priorInput.tone) || 'practical';
  const priorPlatform =
    typeof priorInput.platform === 'string' ? priorInput.platform : platform;

  const job = await enqueueJob({
    workspaceId,
    projectId: script.projectId,
    type: 'GENERATE_SCRIPT',
    input: {
      topic,
      audience,
      tone,
      platform: priorPlatform,
      scriptId,
      refineInstruction: input.instruction,
      title: script.title,
    },
  });

  return { jobId: job.id };
}

/** Used by mock-complete / future worker to append an AI version. */
export async function appendAiScriptVersion(params: {
  workspaceId: string;
  projectId: string;
  scriptId?: string | null;
  title?: string | null;
  content: ScriptContent;
  source: ScriptSource;
}): Promise<{ scriptId: string; versionId: string; version: number }> {
  await assertOwnedProject(params.workspaceId, params.projectId);

  if (params.scriptId) {
    await findOwnedScript(params.workspaceId, params.scriptId);
    const version = await createScriptVersion(
      params.workspaceId,
      params.scriptId,
      { content: params.content, source: params.source },
    );
    return {
      scriptId: params.scriptId,
      versionId: version.id,
      version: version.version,
    };
  }

  const created = await createScript(params.workspaceId, params.projectId, {
    title: params.title ?? params.content.title ?? null,
    content: params.content,
    source: params.source,
  });
  const first = created.versions[0];
  if (!first) {
    throw new ScriptHttpError(
      500,
      'internal_error',
      'Failed to create script version',
    );
  }
  return {
    scriptId: created.id,
    versionId: first.id,
    version: first.version,
  };
}
