/**
 * Proposed auth DTOs for Phase 2 (Dev C — Arvin).
 *
 * INTENTIONAL LOCATION: `docs/proposed-auth-types.ts`
 * Do NOT treat as the production source of truth yet.
 *
 * Anto (Dev B) owns `packages/shared` auth Zod schemas / types this phase.
 * If Anto’s shapes differ, prefer Anto’s at Integration and delete or shrink this file.
 *
 * Aligned with:
 * - SDD.md §5.1 Auth routes, §5.10 Error shape
 * - DEVELOPMENT_PLAN.md Phase 2 Dev B (User + Workspace, JWT with userId + workspaceId)
 * - Password policy: min 8 characters (Cyrus docs; Anto enforces)
 */

/** SDD §5.10 nested error envelope (preferred over Phase 1 flat ApiError placeholder). */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string; // ISO-8601
};

export type AuthTokenPayload = {
  userId: string;
  workspaceId: string;
  /** Optional standard JWT claims Anto may include */
  sub?: string;
  iat?: number;
  exp?: number;
};

export type RegisterRequest = {
  email: string;
  password: string; // min 8
  name: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

/**
 * Register/login success body — field names may be `token` or `accessToken`.
 * Integration should pick one and document it in packages/shared.
 */
export type AuthSuccessResponse = {
  user: PublicUser;
  workspaceId: string;
  token: string;
};

export type MeResponse = {
  user: PublicUser;
  workspaceId: string;
};

/** Suggested stable error codes for auth negatives (see docs/testing/phase-2-auth.md). */
export type AuthErrorCode =
  | 'VALIDATION_ERROR'
  | 'EMAIL_TAKEN'
  | 'CONFLICT'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'INVALID_TOKEN';
