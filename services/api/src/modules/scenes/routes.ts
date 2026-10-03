import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  fulfillSceneRequestSchema,
  generateSceneRequestSchema,
  scenePipelineRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import {
  ScenesHttpError,
  enqueueGenerateScene,
  enqueueMatchScenes,
  enqueueReviewFootage,
  fulfillSceneWithAsset,
} from './service';

function sendScenesError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: ScenesHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

export async function registerSceneRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    `${API_PREFIX}/projects/:id/scenes/fulfill`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = fulfillSceneRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await fulfillSceneWithAsset(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof ScenesHttpError) {
          return sendScenesError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/projects/:id/scenes/generate`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = generateSceneRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueGenerateScene(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof ScenesHttpError) {
          return sendScenesError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/projects/:id/scenes/review`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = scenePipelineRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueReviewFootage(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof ScenesHttpError) {
          return sendScenesError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/projects/:id/scenes/match`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = scenePipelineRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueMatchScenes(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof ScenesHttpError) {
          return sendScenesError(reply, err);
        }
        throw err;
      }
    },
  );
}
