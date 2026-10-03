import { OpenAiCompatibleProvider } from '../openaiCompatible/OpenAiCompatibleProvider';

/** Llama 3.3 left the free/dev tier; gpt-oss-20b is the current free default. */
const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const GROQ_BASE = 'https://api.groq.com/openai/v1';

/**
 * Groq (OpenAI-compatible). Free tier rate limits apply — used as a backup.
 * https://console.groq.com
 */
export class GroqProvider extends OpenAiCompatibleProvider {
  constructor(opts?: { apiKey?: string; model?: string }) {
    super({
      name: 'groq',
      label: 'Groq',
      baseUrl: GROQ_BASE,
      apiKey: opts?.apiKey ?? process.env.GROQ_API_KEY ?? '',
      model: opts?.model ?? process.env.GROQ_MODEL ?? DEFAULT_MODEL,
      missingKeyMessage:
        'GROQ_API_KEY is required when AI_PROVIDER=groq (https://console.groq.com)',
      retryWithoutJsonFormat: true,
    });
  }
}
