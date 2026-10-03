import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  alignScriptRequestSchema,
  patchMappingRequestSchema,
  transcribeRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import {
  MappingHttpError,
  enqueueAlignScript,
  enqueueTranscribe,
  listMappings,
  listTranscripts,
  patchMapping,
} from './service';

function sendMappingError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: MappingHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

export async function registerMappingRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    `${API_PREFIX}/projects/:id/transcribe`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = transcribeRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueTranscribe(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof MappingHttpError) {
          return sendMappingError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/projects/:id/transcripts`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      try {
        const result = await listTranscripts(
          request.auth!.workspaceId,
          projectId,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof MappingHttpError) {
          return sendMappingError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/projects/:id/align`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = alignScriptRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueAlignScript(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof MappingHttpError) {
          return sendMappingError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/projects/:id/mappings`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      try {
        const result = await listMappings(
          request.auth!.workspaceId,
          projectId,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof MappingHttpError) {
          return sendMappingError(reply, err);
        }
        throw err;
      }
    },
  );

  app.patch(
    `${API_PREFIX}/mappings/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = patchMappingRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await patchMapping(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof MappingHttpError) {
          return sendMappingError(reply, err);
        }
        throw err;
      }
    },
  );
}
