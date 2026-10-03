import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  attachAssetsRequestSchema,
  createProjectRequestSchema,
  detachAssetsRequestSchema,
  projectListQuerySchema,
  transitionStageRequestSchema,
  updateProjectRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import {
  ProjectHttpError,
  attachAssets,
  createProject,
  detachAssets,
  getProject,
  getStageHistory,
  listProjects,
  softDeleteProject,
  transitionStage,
  updateProject,
} from './service';

function sendProjectError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: ProjectHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

export async function registerProjectRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    `${API_PREFIX}/projects`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = createProjectRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const project = await createProject(
          request.auth!.workspaceId,
          parsed.data,
        );
        return reply.status(201).send(project);
      } catch (err) {
        if (err instanceof ProjectHttpError) {
          return sendProjectError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/projects`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = projectListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await listProjects(
          request.auth!.workspaceId,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof ProjectHttpError) {
          return sendProjectError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/projects/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const project = await getProject(request.auth!.workspaceId, id);
        return reply.status(200).send(project);
      } catch (err) {
        if (err instanceof ProjectHttpError) {
          return sendProjectError(reply, err);
        }
        throw err;
      }
    },
  );

  app.patch(
    `${API_PREFIX}/projects/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateProjectRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const project = await updateProject(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(project);
      } catch (err) {
        if (err instanceof ProjectHttpError) {
          return sendProjectError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/projects/:id/stage`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = transitionStageRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const project = await transitionStage(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(project);
      } catch (err) {
        if (err instanceof ProjectHttpError) {
          return sendProjectError(reply, err);
        }
        throw err;
      }
    },
  );

  app.post(
    `${API_PREFIX}/projects/:id/assets`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = attachAssetsRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const project = await attachAssets(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(project);
      } catch (err) {
        if (err instanceof ProjectHttpError) {
          return sendProjectError(reply, err);
        }
        throw err;
      }
    },
  );

  app.delete(
    `${API_PREFIX}/projects/:id/assets`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = detachAssetsRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const project = await detachAssets(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(project);
      } catch (err) {
        if (err instanceof ProjectHttpError) {
          return sendProjectError(reply, err);
        }
        throw err;
      }
    },
  );

  app.delete(
    `${API_PREFIX}/projects/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await softDeleteProject(request.auth!.workspaceId, id);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof ProjectHttpError) {
          return sendProjectError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/projects/:id/stage-history`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const history = await getStageHistory(request.auth!.workspaceId, id);
        return reply.status(200).send(history);
      } catch (err) {
        if (err instanceof ProjectHttpError) {
          return sendProjectError(reply, err);
        }
        throw err;
      }
    },
  );
}
