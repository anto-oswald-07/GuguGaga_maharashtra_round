import { OpenAiCompatibleProvider } from '../openaiCompatible/OpenAiCompatibleProvider';

const DEFAULT_MODEL = 'mistral-small-latest';
const MISTRAL_BASE = 'https://api.mistral.ai/v1';

/**
 * Mistral AI (OpenAI-compatible). Experiment / free tiers vary by account.
 * https://console.mistral.ai
 */
export class MistralProvider extends OpenAiCompatibleProvider {
  constructor(opts?: { apiKey?: string; model?: string }) {
    super({
      name: 'mistral',
      label: 'Mistral',
      baseUrl: MISTRAL_BASE,
      apiKey: opts?.apiKey ?? process.env.MISTRAL_API_KEY ?? '',
      model: opts?.model ?? process.env.MISTRAL_MODEL ?? DEFAULT_MODEL,
      missingKeyMessage:
        'MISTRAL_API_KEY is required when AI_PROVIDER=mistral (https://console.mistral.ai)',
      retryWithoutJsonFormat: true,
    });
  }
}
