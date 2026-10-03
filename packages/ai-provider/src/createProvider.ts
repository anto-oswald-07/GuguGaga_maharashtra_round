import { GeminiProvider } from './gemini/GeminiProvider';
import { MockAiProvider } from './mock/MockAiProvider';
import { OpenAiProvider } from './openai/OpenAiProvider';
import {
  AiProviderError,
  type AiProvider,
  type AiProviderName,
} from './types';

export type CreateAiProviderOptions = {
  /** Overrides `AI_PROVIDER` env (`mock` | `openai` | `gemini`). */
  provider?: string;
  /**
   * Mock-only demo seed (`AI_MOCK_SEED`). Changes deterministic variation lanes;
   * never enables free randomness. Ignored for openai/gemini.
   */
  mockSeed?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  openaiModel?: string;
  geminiModel?: string;
};

function normalizeName(raw: string | undefined): AiProviderName {
  const v = (raw ?? 'mock').trim().toLowerCase();
  if (v === 'mock' || v === 'openai' || v === 'gemini') return v;
  throw new AiProviderError(
    `Invalid AI_PROVIDER="${raw}". Use mock|openai|gemini.`,
    'invalid_config',
  );
}

/**
 * Factory: picks provider from env / options.
 * Default is `mock` so demos work without API keys.
 */
export function createAiProvider(
  opts: CreateAiProviderOptions = {},
): AiProvider {
  const name = normalizeName(opts.provider ?? process.env.AI_PROVIDER);
  switch (name) {
    case 'mock':
      return new MockAiProvider({ seed: opts.mockSeed });
    case 'openai':
      return new OpenAiProvider({
        apiKey: opts.openaiApiKey,
        model: opts.openaiModel,
      });
    case 'gemini':
      return new GeminiProvider({
        apiKey: opts.geminiApiKey,
        model: opts.geminiModel,
      });
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}
