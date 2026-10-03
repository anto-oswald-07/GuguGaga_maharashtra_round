import type {
  InsightMetricDto,
  InsightsOverview,
  Platform,
  PostEngagementRequest,
  ProjectStage,
} from '@creatorai/shared';
import { PROJECT_STAGES, PLATFORMS } from '@creatorai/shared';
import type { InsightMetric, Platform as PrismaPlatform } from '@prisma/client';
import { prisma } from '../../db/prisma';

export class InsightsHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'InsightsHttpError';
  }
}

function toMetricDto(row: InsightMetric): InsightMetricDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    packId: row.packId,
    platform: row.platform,
    views: row.views,
    likes: row.likes,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Workspace production + engagement metrics (FR-INT-001/002/003/004).
 * Uses indexed groupBy/count queries — safe for demo-scale data.
 */
export async function getOverview(
  workspaceId: string,
): Promise<InsightsOverview> {
  const [
    projects,
    assets,
    clips,
    packs,
    jobsRunning,
    jobsQueued,
    jobsFailed,
    jobsSucceeded,
    stageGroups,
    clipGroups,
    platformGroups,
    clipLengthRows,
    engagementAgg,
    stageEvents,
  ] = await Promise.all([
    prisma.project.count({
      where: { workspaceId, deletedAt: null },
    }),
    prisma.asset.count({
      where: { workspaceId, deletedAt: null },
    }),
    prisma.clipCandidate.count({
      where: { project: { workspaceId, deletedAt: null } },
    }),
    prisma.platformPack.count({
      where: { project: { workspaceId, deletedAt: null } },
    }),
    prisma.job.count({ where: { workspaceId, status: 'RUNNING' } }),
    prisma.job.count({ where: { workspaceId, status: 'QUEUED' } }),
    prisma.job.count({ where: { workspaceId, status: 'FAILED' } }),
    prisma.job.count({ where: { workspaceId, status: 'SUCCEEDED' } }),
    prisma.project.groupBy({
      by: ['stage'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.clipCandidate.groupBy({
      by: ['projectId'],
      where: { project: { workspaceId, deletedAt: null } },
      _count: { _all: true },
    }),
    prisma.platformPack.groupBy({
      by: ['platform'],
      where: { project: { workspaceId, deletedAt: null } },
      _count: { _all: true },
    }),
    prisma.clipCandidate.findMany({
      where: { project: { workspaceId, deletedAt: null } },
      select: { startMs: true, endMs: true },
      take: 5000,
    }),
    prisma.insightMetric.aggregate({
      where: { workspaceId },
      _sum: { views: true, likes: true },
      _count: { _all: true },
    }),
    prisma.stageEvent.findMany({
      where: { project: { workspaceId, deletedAt: null } },
      orderBy: [{ projectId: 'asc' }, { createdAt: 'asc' }],
      select: {
        projectId: true,
        fromStage: true,
        toStage: true,
        createdAt: true,
      },
    }),
  ]);

  let avgClipLengthMs: number | null = null;
  if (clipLengthRows.length > 0) {
    const sum = clipLengthRows.reduce(
      (acc, c) => acc + Math.max(0, c.endMs - c.startMs),
      0,
    );
    avgClipLengthMs = Math.round(sum / clipLengthRows.length);
  }

  const stageCountMap = new Map<ProjectStage, number>(
    PROJECT_STAGES.map((s) => [s, 0]),
  );
  for (const g of stageGroups) {
    stageCountMap.set(g.stage as ProjectStage, g._count._all);
  }
  const stageDistribution = PROJECT_STAGES.map((stage) => ({
    stage,
    count: stageCountMap.get(stage) ?? 0,
  }));

  const projectIds = clipGroups.map((g) => g.projectId);
  const projectTitles =
    projectIds.length === 0
      ? []
      : await prisma.project.findMany({
          where: { id: { in: projectIds }, workspaceId },
          select: { id: true, title: true },
        });
  const titleById = new Map(projectTitles.map((p) => [p.id, p.title]));
  const clipsPerProject = clipGroups
    .map((g) => ({
      projectId: g.projectId,
      title: titleById.get(g.projectId) ?? 'Unknown project',
      clipCount: g._count._all,
    }))
    .sort((a, b) => b.clipCount - a.clipCount);

  const platformCountMap = new Map<Platform, number>(
    PLATFORMS.map((p) => [p, 0]),
  );
  for (const g of platformGroups) {
    platformCountMap.set(g.platform as Platform, g._count._all);
  }
  const platformMix = PLATFORMS.map((platform) => ({
    platform,
    count: platformCountMap.get(platform) ?? 0,
  })).filter((p) => p.count > 0);

  // Time-in-stage: for each transition, attribute elapsed time to fromStage
  // (or toStage when fromStage is null = initial).
  const dwellSums = new Map<ProjectStage, { totalMs: number; n: number }>();
  for (const s of PROJECT_STAGES) {
    dwellSums.set(s, { totalMs: 0, n: 0 });
  }
  const byProject = new Map<string, typeof stageEvents>();
  for (const ev of stageEvents) {
    const list = byProject.get(ev.projectId) ?? [];
    list.push(ev);
    byProject.set(ev.projectId, list);
  }
  const now = Date.now();
  for (const events of byProject.values()) {
    for (let i = 0; i < events.length; i++) {
      const cur = events[i]!;
      const next = events[i + 1];
      const endMs = next ? next.createdAt.getTime() : now;
      const startMs = cur.createdAt.getTime();
      const dwell = Math.max(0, endMs - startMs);
      const stage = (cur.toStage ?? cur.fromStage) as ProjectStage | null;
      if (!stage || !dwellSums.has(stage)) continue;
      const bucket = dwellSums.get(stage)!;
      bucket.totalMs += dwell;
      bucket.n += 1;
    }
  }
  const avgTimeInStageMs = PROJECT_STAGES.map((stage) => {
    const bucket = dwellSums.get(stage)!;
    return {
      stage,
      avgMs: bucket.n > 0 ? Math.round(bucket.totalMs / bucket.n) : null,
    };
  });

  return {
    counts: {
      projects,
      assets,
      clips,
      packs,
      jobsRunning,
      jobsQueued,
      jobsFailed,
      jobsSucceeded,
    },
    stageDistribution,
    clipsPerProject,
    platformMix,
    avgClipLengthMs,
    avgTimeInStageMs,
    engagementTotals: {
      views: engagementAgg._sum.views ?? 0,
      likes: engagementAgg._sum.likes ?? 0,
      entries: engagementAgg._count._all,
    },
  };
}

export async function postEngagement(
  workspaceId: string,
  input: PostEngagementRequest,
): Promise<InsightMetricDto> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    throw new InsightsHttpError(
      404,
      'not_found',
      `Project ${input.projectId} not found in this workspace`,
    );
  }

  let platform: PrismaPlatform | null = input.platform ?? null;
  let packId: string | null = input.packId ?? null;

  if (input.packId) {
    const pack = await prisma.platformPack.findFirst({
      where: {
        id: input.packId,
        projectId: input.projectId,
        project: { workspaceId, deletedAt: null },
      },
      select: { id: true, platform: true },
    });
    if (!pack) {
      throw new InsightsHttpError(
        404,
        'not_found',
        `Pack ${input.packId} not found on project ${input.projectId}`,
      );
    }
    packId = pack.id;
    if (!platform) platform = pack.platform;
  }

  if (input.views === 0 && input.likes === 0 && !input.notes) {
    throw new InsightsHttpError(
      400,
      'validation_error',
      'Provide at least one of views, likes, or notes',
    );
  }

  const row = await prisma.insightMetric.create({
    data: {
      workspaceId,
      projectId: input.projectId,
      packId,
      platform,
      views: input.views,
      likes: input.likes,
      notes: input.notes ?? null,
    },
  });

  return toMetricDto(row);
}
