import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  generatePacksRequestSchema,
  patchPackRequestSchema,
  patchPackStatusRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import { storage } from '../../storage/local';
import {
  PacksHttpError,
  deletePack,
  enqueueGeneratePacks,
  getPackDownload,
  getPackFileToDownload,
  listPacks,
  patchPack,
  patchPackStatus,
} from './service';

function sendPacksError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: PacksHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

export async function registerPacksRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    `${API_PREFIX}/projects/:id/packs/generate`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = generatePacksRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueGeneratePacks(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof PacksHttpError) {
          return sendPacksError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/projects/:id/packs`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      try {
        const result = await listPacks(
          request.auth!.workspaceId,
          projectId,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof PacksHttpError) {
          return sendPacksError(reply, err);
        }
        throw err;
      }
    },
  );

  app.patch(
    `${API_PREFIX}/packs/:id/status`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = patchPackStatusRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await patchPackStatus(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof PacksHttpError) {
          return sendPacksError(reply, err);
        }
        throw err;
      }
    },
  );

  /** Convenience PATCH for copy fields without forcing status (UI edits). */
  app.patch(
    `${API_PREFIX}/packs/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = patchPackRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await patchPack(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof PacksHttpError) {
          return sendPacksError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/packs/:id/download`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await getPackDownload(
          request.auth!.workspaceId,
          id,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof PacksHttpError) {
          return sendPacksError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/packs/:id/download-file`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const fileInfo = await getPackFileToDownload(
          request.auth!.workspaceId,
          id,
        );
        const stream = storage.openReadStream(fileInfo.path);
        return reply
          .header('Content-Type', fileInfo.mime)
          .header(
            'Content-Disposition',
            `attachment; filename="${fileInfo.name.replace(/"/g, '')}"`,
          )
          .send(stream);
      } catch (err) {
        if (err instanceof PacksHttpError) {
          return sendPacksError(reply, err);
        }
        throw err;
      }
    },
  );

  app.delete(
    `${API_PREFIX}/packs/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await deletePack(request.auth!.workspaceId, id);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof PacksHttpError) {
          return sendPacksError(reply, err);
        }
        throw err;
      }
    },
  );
}
