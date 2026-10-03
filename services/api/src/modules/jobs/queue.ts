import type { JobType, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export type EnqueueJobParams = {
  workspaceId: string;
  projectId?: string | null;
  type: JobType;
  input?: Record<string, unknown>;
};

/**
 * MVP queue producer: insert a Job row with status QUEUED.
 * Worker (or mock-complete) claims via DB polling — see `docs/jobs/queue.md`.
 */
export async function enqueueJob(params: EnqueueJobParams) {
  return prisma.job.create({
    data: {
      workspaceId: params.workspaceId,
      projectId: params.projectId ?? null,
      type: params.type,
      status: 'QUEUED',
      input: (params.input ?? {}) as Prisma.InputJsonValue,
      progress: 0,
    },
  });
}
