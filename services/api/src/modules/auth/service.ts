import bcrypt from 'bcrypt';
import type {
  AuthTokenResponse,
  LoginRequest,
  MeResponse,
  PublicUser,
  RegisterRequest,
  WorkspaceDto,
} from '@creatorai/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { signAccessToken } from '../../auth/jwt';

const BCRYPT_ROUNDS = 10;

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

function toWorkspaceDto(ws: {
  id: string;
  userId: string;
  createdAt: Date;
}): WorkspaceDto {
  return {
    id: ws.id,
    userId: ws.userId,
    createdAt: ws.createdAt.toISOString(),
  };
}

export class AuthHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthHttpError';
  }
}

export async function registerUser(
  input: RegisterRequest,
): Promise<AuthTokenResponse> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email.toLowerCase().trim(),
          passwordHash,
          name: input.name.trim(),
        },
      });
      const workspace = await tx.workspace.create({
        data: { userId: user.id },
      });
      return { user, workspace };
    });

    const token = signAccessToken({
      userId: result.user.id,
      workspaceId: result.workspace.id,
    });

    return {
      token,
      user: toPublicUser(result.user),
      workspace: toWorkspaceDto(result.workspace),
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new AuthHttpError(
        409,
        'conflict',
        'An account with this email already exists',
      );
    }
    throw err;
  }
}

export async function loginUser(
  input: LoginRequest,
): Promise<AuthTokenResponse> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase().trim() },
    include: { workspace: true },
  });

  if (!user || !user.workspace) {
    throw new AuthHttpError(401, 'unauthorized', 'Invalid email or password');
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    throw new AuthHttpError(401, 'unauthorized', 'Invalid email or password');
  }

  const token = signAccessToken({
    userId: user.id,
    workspaceId: user.workspace.id,
  });

  return {
    token,
    user: toPublicUser(user),
    workspace: toWorkspaceDto(user.workspace),
  };
}

export async function getMe(userId: string): Promise<MeResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { workspace: true },
  });

  if (!user || !user.workspace) {
    throw new AuthHttpError(401, 'unauthorized', 'User not found');
  }

  return {
    user: toPublicUser(user),
    workspace: toWorkspaceDto(user.workspace),
  };
}
