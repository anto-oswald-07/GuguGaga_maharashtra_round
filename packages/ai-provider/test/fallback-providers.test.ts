import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AiProviderError,
  FallbackAiProvider,
  createAiProvider,
  isFallbackWorthy,
} from '../src/index.ts';
import type { AiProvider, ScriptGenInput, ScriptGenResult } from '../src/types.ts';

function fakeProvider(
  name: AiProvider['name'],
  behavior: 'ok' | 'quota' | 'parse',
): AiProvider {
  const result: ScriptGenResult = {
    title: `from-${name}`,
    hook: 'hook',
    body: 'body',
    cta: 'cta',
    fullText: 'full',
    provider: name,
    model: 'test',
  };
  const fail = () => {
    if (behavior === 'quota') {
      throw new AiProviderError(`${name} out of credits`, 'quota_exceeded', 403);
    }
    throw new AiProviderError(`${name} bad json`, 'parse_error');
  };
  return {
    name,
    async generateScript() {
      if (behavior !== 'ok') fail();
      return result;
    },
    async generateHooks() {
      if (behavior !== 'ok') fail();
      return ['h1'];
    },
    async generateSupporting() {
      if (behavior !== 'ok') fail();
      return { byPlatform: {}, provider: name, model: 'test' };
    },
    async transcribe() {
      if (behavior !== 'ok') fail();
      return { segments: [] };
    },
    async alignScriptToTranscript() {
      return [];
    },
    async scoreClipWindows() {
      return [];
    },
    async proposeTimeline() {
      if (behavior !== 'ok') fail();
      return {
        schemaVersion: '1.0',
        fps: 30,
        durationMs: 3000,
        tracks: [
          { id: 'v1', type: 'video', clips: [] },
          { id: 't1', type: 'text', items: [] },
          { id: 'cap1', type: 'captions', items: [] },
        ],
        transitions: [],
        meta: { generatedBy: 'mock' },
      };
    },
  };
}

const sampleInput: ScriptGenInput = {
  topic: 't',
  audience: 'a',
  tone: 'practical',
  platform: 'TIKTOK',
};

describe('createAiProvider backups', () => {
  it('accepts openrouter / groq / mistral when keys are set', () => {
    const prev = {
      AI_PROVIDER: process.env.AI_PROVIDER,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      AI_FALLBACK: process.env.AI_FALLBACK,
    };
    try {
      process.env.AI_FALLBACK = '0';
      process.env.OPENROUTER_API_KEY = 'or-test';
      process.env.AI_PROVIDER = 'openrouter';
      assert.equal(createAiProvider().name, 'openrouter');

      process.env.GROQ_API_KEY = 'gsk-test';
      process.env.AI_PROVIDER = 'groq';
      assert.equal(createAiProvider().name, 'groq');

      process.env.MISTRAL_API_KEY = 'mistral-test';
      process.env.AI_PROVIDER = 'mistral';
      assert.equal(createAiProvider().name, 'mistral');
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('AI_PROVIDER=auto falls back to mock when no live keys', () => {
    const prev = {
      AI_PROVIDER: process.env.AI_PROVIDER,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
      GROK_API_KEY: process.env.GROK_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    };
    try {
      process.env.AI_PROVIDER = 'auto';
      for (const k of [
        'OPENAI_API_KEY',
        'GEMINI_API_KEY',
        'XAI_API_KEY',
        'GROK_API_KEY',
        'OPENROUTER_API_KEY',
        'GROQ_API_KEY',
        'MISTRAL_API_KEY',
      ]) {
        delete process.env[k];
      }
      const ai = createAiProvider();
      assert.equal(ai.name, 'mock');
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe('FallbackAiProvider', () => {
  it('skips quota_exceeded and uses the next provider', async () => {
    const chain = new FallbackAiProvider([
      fakeProvider('grok', 'quota'),
      fakeProvider('gemini', 'ok'),
    ]);
    const script = await chain.generateScript(sampleInput);
    assert.equal(script.provider, 'gemini');
    assert.equal(script.title, 'from-gemini');
  });

  it('does not fall through on parse_error', async () => {
    const chain = new FallbackAiProvider([
      fakeProvider('groq', 'parse'),
      fakeProvider('gemini', 'ok'),
    ]);
    await assert.rejects(
      () => chain.generateScript(sampleInput),
      (err: unknown) =>
        err instanceof AiProviderError && err.code === 'parse_error',
    );
  });

  it('isFallbackWorthy recognises rate limits', () => {
    assert.equal(
      isFallbackWorthy(new AiProviderError('x', 'rate_limited', 429)),
      true,
    );
    assert.equal(
      isFallbackWorthy(new AiProviderError('x', 'parse_error')),
      false,
    );
  });
});
