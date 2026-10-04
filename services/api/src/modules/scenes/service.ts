/**
 * Scene fulfillment + pipeline enqueue (Phases A–C).
 * Scenes live on ScriptVersion.content.scenes[]; jobs fill / review / trim them.
 */
import type {
  EnqueueJobResponse,
  FulfillSceneRequest,
  GenerateSceneRequest,
  ScenePipelineRequest,
  ScriptContent,
  ScriptScene,
} from '@creatorai/shared';
import { ensureScriptScenes } from '@creatorai/ai-provider';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { enqueueJob } from '../jobs/queue';
import { appendAiScriptVersion } from '../scripts/service';

export class ScenesHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'ScenesHttpError';
  }
}

function parseContent(raw: unknown): ScriptContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { hook: '', body: '', cta: '' };
  }
  const o = raw as Record<string, unknown>;
  const scenes = Array.isArray(o.scenes)
    ? (o.scenes as ScriptScene[])
    : undefined;
  return {
    hook: typeof o.hook === 'string' ? o.hook : '',
    body: typeof o.body === 'string' ? o.body : '',
    cta: typeof o.cta === 'string' ? o.cta : '',
    title: typeof o.title === 'string' ? o.title : undefined,
    rawText: typeof o.rawText === 'string' ? o.rawText : undefined,
    ...(scenes && scenes.length > 0 ? { scenes } : {}),
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
    throw new ScenesHttpError(404, 'not_found', 'Project not found');
  }
}

async function loadLatestScriptContent(
  workspaceId: string,
  projectId: string,
  scriptId: string,
): Promise<{ content: ScriptContent; scenes: ScriptScene[] }> {
  const script = await prisma.scriptDocument.findFirst({
    where: {
      id: scriptId,
      projectId,
      project: { workspaceId, deletedAt: null },
    },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!script || !script.versions[0]) {
    throw new ScenesHttpError(404, 'not_found', 'Script not found');
  }
  const content = parseContent(script.versions[0].content);
  const hadScenes = Array.isArray(content.scenes) && content.scenes.length > 0;
  const scenes = ensureScriptScenes({
    hook: content.hook,
    body: content.body,
    cta: content.cta,
    title: content.title,
    scenes: content.scenes,
  }, { deterministic: true });
  // Persist derived scenes once so scene IDs stay stable across fulfill/generate.
  if (!hadScenes && scenes.length > 0) {
    const persisted = await appendAiScriptVersion({
      workspaceId,
      projectId,
      scriptId,
      content: { ...content, scenes },
      source: 'AI',
    });
    void persisted;
  }
  return { content: { ...content, scenes }, scenes };
}

/** Attach an existing project asset to a scene slot (upload fulfillment). */
export async function fulfillSceneWithAsset(
  workspaceId: string,
  projectId: string,
  input: FulfillSceneRequest,
): Promise<{ scriptId: string; versionId: string; scene: ScriptScene }> {
  await assertOwnedProject(workspaceId, projectId);

  const link = await prisma.projectAsset.findFirst({
    where: {
      projectId,
      assetId: input.assetId,
      project: { workspaceId, deletedAt: null },
      asset: { workspaceId, deletedAt: null },
    },
    select: { assetId: true },
  });
  if (!link) {
    throw new ScenesHttpError(
      404,
      'not_found',
      'Asset not found on this project — attach it first',
    );
  }

  const { content, scenes } = await loadLatestScriptContent(
    workspaceId,
    projectId,
    input.scriptId,
  );
  const idx = scenes.findIndex((s) => s.id === input.sceneId);
  if (idx < 0) {
    throw new ScenesHttpError(404, 'not_found', 'Scene not found on script');
  }

  const nextScenes = scenes.map((s, i) =>
    i === idx
      ? {
          ...s,
          fulfillment: {
            ...s.fulfillment,
            mode: 'UPLOAD' as const,
            assetId: input.assetId,
            opinion: undefined,
            matchConfidence: undefined,
            clipCandidateId: undefined,
          },
        }
      : s,
  );

  const nextContent: ScriptContent = { ...content, scenes: nextScenes };
  const result = await appendAiScriptVersion({
    workspaceId,
    projectId,
    scriptId: input.scriptId,
    content: nextContent,
    source: 'USER',
  });

  // Nudge stage toward RECORDED when still at IDEA/SCRIPT.
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { stage: true },
  });
  if (project && ['IDEA', 'SCRIPT'].includes(project.stage)) {
    await prisma.project.update({
      where: { id: projectId },
      data: { stage: 'RECORDED' },
    });
    await prisma.stageEvent.create({
      data: {
        projectId,
        fromStage: project.stage,
        toStage: 'RECORDED',
      },
    });
  }

  return {
    scriptId: result.scriptId,
    versionId: result.versionId,
    scene: nextScenes[idx]!,
  };
}

export async function enqueueGenerateScene(
  workspaceId: string,
  projectId: string,
  input: GenerateSceneRequest,
): Promise<EnqueueJobResponse> {
  await assertOwnedProject(workspaceId, projectId);
  const { scenes } = await loadLatestScriptContent(
    workspaceId,
    projectId,
    input.scriptId,
  );
  if (!scenes.some((s) => s.id === input.sceneId)) {
    throw new ScenesHttpError(404, 'not_found', 'Scene not found on script');
  }

  const job = await enqueueJob({
    workspaceId,
    projectId,
    type: 'GENERATE_SCENE',
    input: {
      scriptId: input.scriptId,
      sceneId: input.sceneId,
      ...(input.prompt ? { prompt: input.prompt } : {}),
    },
  });
  return { jobId: job.id };
}

export async function enqueueReviewFootage(
  workspaceId: string,
  projectId: string,
  input: ScenePipelineRequest,
): Promise<EnqueueJobResponse> {
  await assertOwnedProject(workspaceId, projectId);
  await loadLatestScriptContent(workspaceId, projectId, input.scriptId);

  const job = await enqueueJob({
    workspaceId,
    projectId,
    type: 'REVIEW_FOOTAGE',
    input: {
      scriptId: input.scriptId,
      ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    },
  });
  return { jobId: job.id };
}

export async function enqueueMatchScenes(
  workspaceId: string,
  projectId: string,
  input: ScenePipelineRequest,
): Promise<EnqueueJobResponse> {
  await assertOwnedProject(workspaceId, projectId);
  await loadLatestScriptContent(workspaceId, projectId, input.scriptId);

  const job = await enqueueJob({
    workspaceId,
    projectId,
    type: 'MATCH_SCENES',
    input: {
      scriptId: input.scriptId,
      ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    },
  });
  return { jobId: job.id };
}

/** Persist updated scenes onto a new script version (job completion). */
export async function persistScriptScenes(params: {
  workspaceId: string;
  projectId: string;
  scriptId: string;
  content: ScriptContent;
  scenes: ScriptScene[];
  source?: 'AI' | 'USER' | 'REFINE';
}): Promise<{ scriptId: string; versionId: string; version: number }> {
  const next: ScriptContent = { ...params.content, scenes: params.scenes };
  return appendAiScriptVersion({
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    scriptId: params.scriptId,
    content: next,
    source: params.source ?? 'AI',
  });
}

export async function loadScriptScenesForJob(
  workspaceId: string,
  projectId: string,
  scriptId: string,
): Promise<{ content: ScriptContent; scenes: ScriptScene[] }> {
  return loadLatestScriptContent(workspaceId, projectId, scriptId);
}

/** Used by GENERATE_SCENE after asset is created — update one scene fulfillment. */
export async function applySceneFulfillment(params: {
  workspaceId: string;
  projectId: string;
  scriptId: string;
  sceneId: string;
  fulfillment: ScriptScene['fulfillment'];
}): Promise<{ scriptId: string; versionId: string; scenes: ScriptScene[] }> {
  const { content, scenes } = await loadLatestScriptContent(
    params.workspaceId,
    params.projectId,
    params.scriptId,
  );
  const nextScenes = scenes.map((s) =>
    s.id === params.sceneId
      ? { ...s, fulfillment: { ...s.fulfillment, ...params.fulfillment } }
      : s,
  );
  const result = await persistScriptScenes({
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    scriptId: params.scriptId,
    content,
    scenes: nextScenes,
    source: 'AI',
  });
  return {
    scriptId: result.scriptId,
    versionId: result.versionId,
    scenes: nextScenes,
  };
}

export type { ScriptContent, ScriptScene, Prisma };
