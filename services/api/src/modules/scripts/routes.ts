import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  createScriptRequestSchema,
  createScriptVersionRequestSchema,
  generateHooksRequestSchema,
  generateScriptRequestSchema,
  generateSupportingRequestSchema,
  refineScriptRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import {
  ScriptHttpError,
  createScript,
  createScriptVersion,
  deleteScript,
  enqueueGenerateHooks,
  enqueueGenerateScript,
  enqueueGenerateSupporting,
  enqueueRefineScript,
  getScript,
  listScripts,
} from './service';

function sendScriptError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: ScriptHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

export async function registerScriptRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    `${API_PREFIX}/projects/:id/scripts`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = createScriptRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const script = await createScript(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(201).send(script);
      } catch (err) {
        if (err instanceof ScriptHttpError) {
          return sendScriptError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/projects/:id/scripts`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      try {
        const result = await listScripts(
          request.auth!.workspaceId,
          projectId,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof ScriptHttpError) {
          return sendScriptError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/projects/:id/scripts/generate`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const parsed = generateScriptRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueGenerateScript(
          request.auth!.workspaceId,
          projectId,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof ScriptHttpError) {
          return sendScriptError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/scripts/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const script = await getScript(request.auth!.workspaceId, id);
        return reply.status(200).send(script);
      } catch (err) {
        if (err instanceof ScriptHttpError) {
          return sendScriptError(reply, err);
        }
        throw err;
      }
    },
  );

  app.delete(
    `${API_PREFIX}/scripts/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await deleteScript(request.auth!.workspaceId, id);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof ScriptHttpError) {
          return sendScriptError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/scripts/:id/versions`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = createScriptVersionRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const version = await createScriptVersion(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(201).send(version);
      } catch (err) {
        if (err instanceof ScriptHttpError) {
          return sendScriptError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/scripts/:id/refine`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = refineScriptRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueRefineScript(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof ScriptHttpError) {
          return sendScriptError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/scripts/:id/hooks`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = generateHooksRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueGenerateHooks(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof ScriptHttpError) {
          return sendScriptError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/scripts/:id/supporting`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = generateSupportingRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await enqueueGenerateSupporting(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof ScriptHttpError) {
          return sendScriptError(reply, err);
        }
        throw err;
      }
    },
  );
}
