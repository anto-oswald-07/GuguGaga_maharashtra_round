import { FallbackAiProvider } from './fallback/FallbackAiProvider';
import { GeminiProvider } from './gemini/GeminiProvider';
import { GrokProvider } from './grok/GrokProvider';
import { GroqProvider } from './groq/GroqProvider';
import { MockAiProvider } from './mock/MockAiProvider';
import { MistralProvider } from './mistral/MistralProvider';
import { OpenAiProvider } from './openai/OpenAiProvider';
import { OpenRouterProvider } from './openrouter/OpenRouterProvider';
import {
  AiProviderError,
  type AiProvider,
  type AiProviderName,
} from './types';

/** Preferred backup order after the primary (cheapest / freest first). */
const DEFAULT_FALLBACK_ORDER: Exclude<AiProviderName, 'auto'>[] = [
  'gemini',
  'openrouter',
  'groq',
  'mistral',
  'openai',
  'grok',
  'mock',
];

export type CreateAiProviderOptions = {
  /**
   * Overrides `AI_PROVIDER` env
   * (`mock` | `openai` | `gemini` | `grok` | `openrouter` | `groq` | `mistral` | `auto`).
   */
  provider?: string;
  /**
   * Mock-only demo seed (`AI_MOCK_SEED`). Changes deterministic variation lanes;
   * never enables free randomness. Ignored for live providers.
   */
  mockSeed?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  xaiApiKey?: string;
  openrouterApiKey?: string;
  groqApiKey?: string;
  mistralApiKey?: string;
  openaiModel?: string;
  geminiModel?: string;
  xaiModel?: string;
  openrouterModel?: string;
  groqModel?: string;
  mistralModel?: string;
  /**
   * When true (default), wrap the primary with other keyed providers so rate
   * limits / empty credits automatically fail over. Set `AI_FALLBACK=0` to disable.
   */
  fallback?: boolean;
  /** Override fallback order (comma list or array). */
  fallbackProviders?: string | string[];
};

function envFlagTrue(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  return defaultValue;
}

function normalizeName(raw: string | undefined): AiProviderName {
  const v = (raw ?? 'mock').trim().toLowerCase();
  const allowed: AiProviderName[] = [
    'mock',
    'openai',
    'gemini',
    'grok',
    'openrouter',
    'groq',
    'mistral',
    'auto',
  ];
  if ((allowed as string[]).includes(v)) {
    return v as AiProviderName;
  }
  throw new AiProviderError(
    `Invalid AI_PROVIDER="${raw}". Use mock|openai|gemini|grok|openrouter|groq|mistral|auto.`,
    'invalid_config',
  );
}

function parseFallbackList(
  raw: string | string[] | undefined,
): Exclude<AiProviderName, 'auto'>[] {
  const parts = Array.isArray(raw)
    ? raw
    : (raw ?? process.env.AI_FALLBACK_PROVIDERS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  if (parts.length === 0) return [...DEFAULT_FALLBACK_ORDER];

  const out: Exclude<AiProviderName, 'auto'>[] = [];
  for (const p of parts) {
    const name = normalizeName(p);
    if (name === 'auto') continue;
    if (!out.includes(name)) out.push(name);
  }
  if (!out.includes('mock')) out.push('mock');
  return out.length > 0 ? out : [...DEFAULT_FALLBACK_ORDER];
}

function tryCreate(
  name: Exclude<AiProviderName, 'auto'>,
  opts: CreateAiProviderOptions,
): AiProvider | null {
  try {
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
      case 'grok':
        return new GrokProvider({
          apiKey: opts.xaiApiKey,
          model: opts.xaiModel,
        });
      case 'openrouter':
        return new OpenRouterProvider({
          apiKey: opts.openrouterApiKey,
          model: opts.openrouterModel,
        });
      case 'groq':
        return new GroqProvider({
          apiKey: opts.groqApiKey,
          model: opts.groqModel,
        });
      case 'mistral':
        return new MistralProvider({
          apiKey: opts.mistralApiKey,
          model: opts.mistralModel,
        });
      default: {
        const _exhaustive: never = name;
        return _exhaustive;
      }
    }
  } catch (err) {
    if (err instanceof AiProviderError && err.code === 'missing_api_key') {
      return null;
    }
    throw err;
  }
}

function buildChain(
  primary: AiProviderName,
  opts: CreateAiProviderOptions,
): AiProvider[] {
  const order = parseFallbackList(opts.fallbackProviders);
  const chain: AiProvider[] = [];
  const seen = new Set<string>();

  const push = (name: Exclude<AiProviderName, 'auto'>) => {
    if (seen.has(name)) return;
    const p = tryCreate(name, opts);
    if (!p) return;
    seen.add(name);
    chain.push(p);
  };

  if (primary === 'auto') {
    for (const name of order) push(name);
  } else {
    push(primary);
    for (const name of order) {
      if (name === primary) continue;
      push(name);
    }
  }

  if (chain.length === 0) {
    chain.push(new MockAiProvider({ seed: opts.mockSeed }));
  }
  return chain;
}

/**
 * Factory: picks provider from env / options.
 * Default is `mock` so demos work without API keys.
 *
 * Set `AI_PROVIDER=auto` to pick the first available key in
 * gemini → openrouter → groq → mistral → openai → grok → mock order.
 *
 * With any live primary, other keyed providers are attached as backups
 * unless `AI_FALLBACK=0`. Mock-only stays single-provider by default.
 */
export function createAiProvider(
  opts: CreateAiProviderOptions = {},
): AiProvider {
  const name = normalizeName(opts.provider ?? process.env.AI_PROVIDER);
  // auto always chains. mock stays deterministic unless opts.fallback === true
  // (ignore AI_FALLBACK env so local .env auto settings don't break demos/tests).
  const wantFallback =
    name === 'auto'
      ? true
      : name === 'mock'
        ? opts.fallback === true
        : (opts.fallback ?? envFlagTrue(process.env.AI_FALLBACK, true));

  if (!wantFallback) {
    if (name === 'auto') {
      throw new AiProviderError(
        'AI_PROVIDER=auto requires fallback chaining',
        'invalid_config',
      );
    }
    const single = tryCreate(name, opts);
    if (!single) {
      throw new AiProviderError(
        `AI_PROVIDER=${name} is configured but its API key is missing`,
        'missing_api_key',
      );
    }
    return single;
  }

  const chain = buildChain(name, opts);
  if (chain.length === 1) return chain[0]!;
  return new FallbackAiProvider(chain, name === 'auto' ? 'auto' : name);
}
