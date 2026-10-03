import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAiProvider, AiProviderError } from '../src/index.ts';

describe('createAiProvider grok', () => {
  it('accepts AI_PROVIDER=grok when XAI_API_KEY is set', () => {
    const prevProvider = process.env.AI_PROVIDER;
    const prevKey = process.env.XAI_API_KEY;
    const prevFallback = process.env.AI_FALLBACK;
    try {
      process.env.AI_PROVIDER = 'grok';
      process.env.XAI_API_KEY = 'test-key-not-real';
      process.env.AI_FALLBACK = '0';
      const ai = createAiProvider();
      assert.equal(ai.name, 'grok');
    } finally {
      if (prevProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = prevProvider;
      if (prevKey === undefined) delete process.env.XAI_API_KEY;
      else process.env.XAI_API_KEY = prevKey;
      if (prevFallback === undefined) delete process.env.AI_FALLBACK;
      else process.env.AI_FALLBACK = prevFallback;
    }
  });

  it('throws missing_api_key without XAI_API_KEY when fallbacks disabled', () => {
    const prevProvider = process.env.AI_PROVIDER;
    const prevKey = process.env.XAI_API_KEY;
    const prevGrok = process.env.GROK_API_KEY;
    const prevFallback = process.env.AI_FALLBACK;
    try {
      process.env.AI_PROVIDER = 'grok';
      process.env.AI_FALLBACK = '0';
      delete process.env.XAI_API_KEY;
      delete process.env.GROK_API_KEY;
      assert.throws(
        () => createAiProvider(),
        (err: unknown) =>
          err instanceof AiProviderError && err.code === 'missing_api_key',
      );
    } finally {
      if (prevProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = prevProvider;
      if (prevKey === undefined) delete process.env.XAI_API_KEY;
      else process.env.XAI_API_KEY = prevKey;
      if (prevGrok === undefined) delete process.env.GROK_API_KEY;
      else process.env.GROK_API_KEY = prevGrok;
      if (prevFallback === undefined) delete process.env.AI_FALLBACK;
      else process.env.AI_FALLBACK = prevFallback;
    }
  });
});
