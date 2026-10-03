import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  loginRequestSchema,
  registerRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import {
  AuthHttpError,
  getMe,
  loginUser,
  registerUser,
} from './service';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(`${API_PREFIX}/auth/register`, async (request, reply) => {
    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: parsed.error.issues.map((i) => i.message).join('; '),
        statusCode: 400,
      });
    }
    try {
      const result = await registerUser(parsed.data);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof AuthHttpError) {
        return reply.status(err.statusCode).send({
          error: err.error,
          message: err.message,
          statusCode: err.statusCode,
        });
      }
      throw err;
    }
  });

  app.post(`${API_PREFIX}/auth/login`, async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: parsed.error.issues.map((i) => i.message).join('; '),
        statusCode: 400,
      });
    }
    try {
      const result = await loginUser(parsed.data);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof AuthHttpError) {
        return reply.status(err.statusCode).send({
          error: err.error,
          message: err.message,
          statusCode: err.statusCode,
        });
      }
      throw err;
    }
  });

  app.get(
    `${API_PREFIX}/auth/me`,
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const result = await getMe(request.auth!.userId);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof AuthHttpError) {
          return reply.status(err.statusCode).send({
            error: err.error,
            message: err.message,
            statusCode: err.statusCode,
          });
        }
        throw err;
      }
    },
  );
}
