import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  patchClipCandidateRequestSchema,
  proposeClipsRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import {
  ClipsHttpError,
  enqueueProposeClips,
  enqueueRenderClip,
  listClipCandidates,
  patchClipCandidate,
} from './service';

function sendClipsError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: ClipsHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

export async function registerClipsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    `${API_PREFIX}/projects/:id/clips/propose`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = proposeClipsRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueProposeClips(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof ClipsHttpError) {
          return sendClipsError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/projects/:id/clips/candidates`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      try {
        const result = await listClipCandidates(
          request.auth!.workspaceId,
          projectId,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof ClipsHttpError) {
          return sendClipsError(reply, err);
        }
        throw err;
      }
    },
  );

  app.patch(
    `${API_PREFIX}/clips/candidates/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = patchClipCandidateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await patchClipCandidate(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof ClipsHttpError) {
          return sendClipsError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/clips/candidates/:id/render`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await enqueueRenderClip(
          request.auth!.workspaceId,
          id,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof ClipsHttpError) {
          return sendClipsError(reply, err);
        }
        throw err;
      }
    },
  );
}
