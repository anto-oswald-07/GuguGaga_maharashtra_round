import type {
  AttachAssetsRequest,
  CreateProjectRequest,
  DetachAssetsRequest,
  ProjectDto,
  ProjectListQuery,
  ProjectListResponse,
  StageEventDto,
  StageHistoryResponse,
  TransitionStageRequest,
  UpdateProjectRequest,
} from '@creatorai/shared';
import type { Prisma, Project, ProjectStage, StageEvent } from '@prisma/client';
import { prisma } from '../../db/prisma';

export class ProjectHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectHttpError';
  }
}

type ProjectWithAssets = Project & {
  assets: { assetId: string }[];
};

function toProjectDto(row: ProjectWithAssets): ProjectDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    description: row.description,
    stage: row.stage,
    targetPlatforms: row.targetPlatforms,
    assetIds: row.assets.map((a) => a.assetId),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStageEventDto(row: StageEvent): StageEventDto {
  return {
    id: row.id,
    projectId: row.projectId,
    fromStage: row.fromStage,
    toStage: row.toStage,
    createdAt: row.createdAt.toISOString(),
  };
}

const projectInclude = {
  assets: {
    select: { assetId: true },
    orderBy: { attachedAt: 'asc' as const },
  },
} satisfies Prisma.ProjectInclude;

async function findOwnedProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectWithAssets> {
  const row = await prisma.project.findFirst({
    where: { id: projectId, workspaceId, deletedAt: null },
    include: projectInclude,
  });
  if (!row) {
    throw new ProjectHttpError(404, 'not_found', 'Project not found');
  }
  return row;
}

export async function createProject(
  workspaceId: string,
  input: CreateProjectRequest,
): Promise<ProjectDto> {
  const title = input.title.trim();
  if (!title) {
    throw new ProjectHttpError(400, 'validation_error', 'Title is required');
  }

  const row = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        workspaceId,
        title,
        description: input.description ?? null,
        targetPlatforms: input.targetPlatforms ?? [],
        stage: 'IDEA',
      },
    });

    await tx.stageEvent.create({
      data: {
        projectId: project.id,
        fromStage: null,
        toStage: 'IDEA',
      },
    });

    return tx.project.findUniqueOrThrow({
      where: { id: project.id },
      include: projectInclude,
    });
  });

  return toProjectDto(row);
}

export async function listProjects(
  workspaceId: string,
  query: ProjectListQuery,
): Promise<ProjectListResponse> {
  const where: Prisma.ProjectWhereInput = {
    workspaceId,
    deletedAt: null,
  };

  if (query.stage) {
    where.stage = query.stage;
  }
  if (query.q?.trim()) {
    where.title = { contains: query.q.trim(), mode: 'insensitive' };
  }

  const rows = await prisma.project.findMany({
    where,
    include: projectInclude,
    orderBy: { updatedAt: 'desc' },
  });

  return { items: rows.map(toProjectDto) };
}

export async function getProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectDto> {
  const row = await findOwnedProject(workspaceId, projectId);
  return toProjectDto(row);
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  input: UpdateProjectRequest,
): Promise<ProjectDto> {
  await findOwnedProject(workspaceId, projectId);

  const data: Prisma.ProjectUpdateInput = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) {
      throw new ProjectHttpError(400, 'validation_error', 'Title is required');
    }
    data.title = title;
  }
  if (input.description !== undefined) {
    data.description = input.description;
  }
  if (input.targetPlatforms !== undefined) {
    data.targetPlatforms = input.targetPlatforms;
  }

  const row = await prisma.project.update({
    where: { id: projectId },
    data,
    include: projectInclude,
  });

  return toProjectDto(row);
}

export async function transitionStage(
  workspaceId: string,
  projectId: string,
  input: TransitionStageRequest,
): Promise<ProjectDto> {
  const existing = await findOwnedProject(workspaceId, projectId);
  const toStage = input.stage as ProjectStage;

  // MVP: allow any forward/back transition; always record history.
  if (existing.stage === toStage) {
    return toProjectDto(existing);
  }

  const row = await prisma.$transaction(async (tx) => {
    await tx.stageEvent.create({
      data: {
        projectId,
        fromStage: existing.stage,
        toStage,
      },
    });

    return tx.project.update({
      where: { id: projectId },
      data: { stage: toStage },
      include: projectInclude,
    });
  });

  return toProjectDto(row);
}

export async function attachAssets(
  workspaceId: string,
  projectId: string,
  input: AttachAssetsRequest,
): Promise<ProjectDto> {
  await findOwnedProject(workspaceId, projectId);

  const uniqueIds = [...new Set(input.assetIds)];
  const assets = await prisma.asset.findMany({
    where: {
      id: { in: uniqueIds },
      workspaceId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (assets.length !== uniqueIds.length) {
    const found = new Set(assets.map((a) => a.id));
    const missing = uniqueIds.filter((id) => !found.has(id));
    throw new ProjectHttpError(
      404,
      'not_found',
      `Asset(s) not found in workspace: ${missing.join(', ')}`,
    );
  }

  await prisma.projectAsset.createMany({
    data: uniqueIds.map((assetId) => ({ projectId, assetId })),
    skipDuplicates: true,
  });

  const row = await findOwnedProject(workspaceId, projectId);
  return toProjectDto(row);
}

export async function detachAssets(
  workspaceId: string,
  projectId: string,
  input: DetachAssetsRequest,
): Promise<ProjectDto> {
  await findOwnedProject(workspaceId, projectId);

  const uniqueIds = [...new Set(input.assetIds)];
  await prisma.projectAsset.deleteMany({
    where: {
      projectId,
      assetId: { in: uniqueIds },
    },
  });

  const row = await findOwnedProject(workspaceId, projectId);
  return toProjectDto(row);
}

export async function getStageHistory(
  workspaceId: string,
  projectId: string,
): Promise<StageHistoryResponse> {
  await findOwnedProject(workspaceId, projectId);

  const rows = await prisma.stageEvent.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  });

  return { items: rows.map(toStageEventDto) };
}
