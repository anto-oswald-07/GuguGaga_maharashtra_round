import { AiProviderError } from './types';

/**
 * Map provider HTTP failures into typed AiProviderError codes so FallbackAiProvider
 * can skip rate-limited / out-of-credit backends.
 */
export function httpErrorFromResponse(
  label: string,
  status: number,
  body: string,
): AiProviderError {
  const snippet = body.slice(0, 300);
  const lower = body.toLowerCase();
  const looksLikeQuota =
    /credit|quota|billing|insufficient|payment required|spending limit|out of credits|no credits|exceeded your current quota|resource_exhausted/.test(
      lower,
    );

  if (status === 429) {
    return new AiProviderError(
      `${label} HTTP ${status}: ${snippet}`,
      'rate_limited',
      status,
    );
  }
  if (status === 402 || (status === 403 && looksLikeQuota) || looksLikeQuota) {
    return new AiProviderError(
      `${label} HTTP ${status}: ${snippet}`,
      'quota_exceeded',
      status,
    );
  }
  return new AiProviderError(
    `${label} HTTP ${status}: ${snippet}`,
    'http_error',
    status,
  );
}

/** True when another backend in the chain should be tried. */
export function isFallbackWorthy(err: unknown): boolean {
  if (!(err instanceof AiProviderError)) {
    // Network / fetch failures, unexpected throws
    return true;
  }
  switch (err.code) {
    case 'rate_limited':
    case 'quota_exceeded':
    case 'http_error':
    case 'missing_api_key':
      return true;
    case 'parse_error':
    case 'not_implemented':
    case 'invalid_config':
      return false;
    default:
      return false;
  }
}
