export { API_PREFIX } from './constants';
export {
  PASSWORD_MIN_LENGTH,
  registerRequestSchema,
  loginRequestSchema,
  publicUserSchema,
  workspaceSchema,
  authTokenResponseSchema,
  meResponseSchema,
  type RegisterRequest,
  type LoginRequest,
  type PublicUser,
  type WorkspaceDto,
  type AuthTokenResponse,
  type MeResponse,
  type JwtPayload,
} from './auth';
export {
  MIN_PASSWORD_LENGTH,
  isPasswordAcceptable,
  checkPasswordStrength,
} from './validation/password';
export type { PasswordStrengthResult } from './validation/password';

/** Response shape for `GET /api/v1/health`. */
export type HealthResponse = {
  status: 'ok';
  service: 'api';
};

/** Standard API error payload. */
export type ApiError = {
  error: string;
  message: string;
  statusCode: number;
};
