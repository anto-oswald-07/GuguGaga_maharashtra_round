import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  postEngagementRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import {
  InsightsHttpError,
  getOverview,
  postEngagement,
} from './service';

function sendInsightsError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: InsightsHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

export async function registerInsightsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    `${API_PREFIX}/insights/overview`,
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const overview = await getOverview(request.auth!.workspaceId);
        return reply.status(200).send(overview);
      } catch (err) {
        if (err instanceof InsightsHttpError) {
          return sendInsightsError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/insights/engagement`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = postEngagementRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues
            .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
            .join('; '),
          statusCode: 400,
        });
      }
      try {
        const metric = await postEngagement(
          request.auth!.workspaceId,
          parsed.data,
        );
        return reply.status(201).send(metric);
      } catch (err) {
        if (err instanceof InsightsHttpError) {
          return sendInsightsError(reply, err);
        }
        throw err;
      }
    },
  );
}
