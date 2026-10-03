import { OpenAiCompatibleProvider } from '../openaiCompatible/OpenAiCompatibleProvider';

/**
 * Prefer a concrete free chat model — `openrouter/free` can route to
 * non-chat safety classifiers and break script JSON.
 */
const DEFAULT_MODEL = 'qwen/qwen3.8-27b:free';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter (OpenAI-compatible). Prefer free models for backup usage.
 * https://openrouter.ai/keys
 */
export class OpenRouterProvider extends OpenAiCompatibleProvider {
  constructor(opts?: { apiKey?: string; model?: string }) {
    const referer =
      process.env.OPENROUTER_HTTP_REFERER?.trim() ||
      'https://creatorai.local';
    const title =
      process.env.OPENROUTER_APP_TITLE?.trim() || 'CreatorAi';
    super({
      name: 'openrouter',
      label: 'OpenRouter',
      baseUrl: OPENROUTER_BASE,
      apiKey: opts?.apiKey ?? process.env.OPENROUTER_API_KEY ?? '',
      model:
        opts?.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
      missingKeyMessage:
        'OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter (https://openrouter.ai/keys)',
      headers: {
        'HTTP-Referer': referer,
        'X-Title': title,
      },
      retryWithoutJsonFormat: true,
    });
  }
}
