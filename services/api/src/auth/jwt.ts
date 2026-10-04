import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '@creatorai/shared';

export type AuthUser = JwtPayload;

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthUser;
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 8) {
    throw new Error('JWT_SECRET must be set (min 8 chars)');
  }
  return secret;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as JwtPayload).userId !== 'string' ||
    typeof (decoded as JwtPayload).workspaceId !== 'string'
  ) {
    throw new Error('Invalid token payload');
  }
  return {
    userId: (decoded as JwtPayload).userId,
    workspaceId: (decoded as JwtPayload).workspaceId,
  };
}

/** Fastify preHandler: requires `Authorization: Bearer <token>`. */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  let token: string | undefined;
  if (header?.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else if (request.query && typeof (request.query as Record<string, unknown>).token === 'string') {
    token = ((request.query as Record<string, unknown>).token as string).trim();
  }

  if (!token) {
    return reply.status(401).send({
      error: 'unauthorized',
      message: 'Missing bearer token in Authorization header or token query parameter',
      statusCode: 401,
    });
  }
  try {
    request.auth = verifyAccessToken(token);
  } catch {
    return reply.status(401).send({
      error: 'unauthorized',
      message: 'Invalid or expired token',
      statusCode: 401,
    });
  }
}
