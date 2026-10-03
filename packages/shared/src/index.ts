export { API_PREFIX } from './constants';
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

/** Standard API error payload (placeholder for later phases). */
export type ApiError = {
  error: string;
  message: string;
  statusCode: number;
};
