import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  generateTimelineRequestSchema,
  putTimelineRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import {
  TimelinesHttpError,
  enqueueGenerateTimeline,
  enqueueRenderTimeline,
  getTimeline,
  listTimelines,
  putTimeline,
} from './service';

function sendTimelinesError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: TimelinesHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

export async function registerTimelinesRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    `${API_PREFIX}/projects/:id/timelines/generate`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = generateTimelineRequestSchema.safeParse(
        request.body ?? {},
      );
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueGenerateTimeline(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof TimelinesHttpError) {
          return sendTimelinesError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/projects/:id/timelines`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      try {
        const result = await listTimelines(
          request.auth!.workspaceId,
          projectId,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof TimelinesHttpError) {
          return sendTimelinesError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/timelines/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await getTimeline(request.auth!.workspaceId, id);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof TimelinesHttpError) {
          return sendTimelinesError(reply, err);
        }
        throw err;
      }
    },
  );

  app.put(
    `${API_PREFIX}/timelines/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = putTimelineRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await putTimeline(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof TimelinesHttpError) {
          return sendTimelinesError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/timelines/:id/render`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await enqueueRenderTimeline(
          request.auth!.workspaceId,
          id,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof TimelinesHttpError) {
          return sendTimelinesError(reply, err);
        }
        throw err;
      }
    },
  );
}
