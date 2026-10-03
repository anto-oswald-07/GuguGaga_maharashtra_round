import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  jobListQuerySchema,
  mockCompleteJobRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import {
  JobHttpError,
  getJob,
  listJobs,
  mockCompleteJob,
  retryJob,
} from './service';

function sendJobError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: JobHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    `${API_PREFIX}/jobs`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = jobListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues
            .map((i) => `${i.path.join('.') || 'query'}: ${i.message}`)
            .join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await listJobs(request.auth!.workspaceId, parsed.data);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof JobHttpError) {
          return sendJobError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/jobs/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const job = await getJob(request.auth!.workspaceId, id);
        return reply.status(200).send(job);
      } catch (err) {
        if (err instanceof JobHttpError) {
          return sendJobError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/jobs/:id/retry`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const job = await retryJob(request.auth!.workspaceId, id);
        return reply.status(201).send(job);
      } catch (err) {
        if (err instanceof JobHttpError) {
          return sendJobError(reply, err);
        }
        throw err;
      }
    },
  );

  /**
   * Temporary UI/dev endpoint — simulates worker completion.
   * Remove or gate behind env once `services/worker` consumer is wired (Phase 5 Integration).
   */
  app.post(
    `${API_PREFIX}/jobs/:id/mock-complete`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = mockCompleteJobRequestSchema.safeParse(
        request.body ?? {},
      );
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
        const job = await mockCompleteJob(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(job);
      } catch (err) {
        if (err instanceof JobHttpError) {
          return sendJobError(reply, err);
        }
        throw err;
      }
    },
  );
}
