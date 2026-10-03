export { API_PREFIX } from './constants';

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
