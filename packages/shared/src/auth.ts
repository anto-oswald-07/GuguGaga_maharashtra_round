import { z } from 'zod';

/** Min password length (Phase 2 — enforced in API + shared schema). */
export const PASSWORD_MIN_LENGTH = 8;

export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
  name: z.string().min(1).max(120),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type WorkspaceDto = z.infer<typeof workspaceSchema>;

export const authTokenResponseSchema = z.object({
  token: z.string().min(1),
  user: publicUserSchema,
  workspace: workspaceSchema,
});
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;

export const meResponseSchema = z.object({
  user: publicUserSchema,
  workspace: workspaceSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Claims embedded in JWT access tokens. */
export type JwtPayload = {
  userId: string;
  workspaceId: string;
};
