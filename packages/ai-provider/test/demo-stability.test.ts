import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_AI_MOCK_SEED,
  MockAiProvider,
  createAiProvider,
  demoHash,
  resolveMockSeed,
} from '../src/index';

const DEMO_INPUT = {
  topic: 'How I batch-create Reels in one afternoon',
  audience: 'Solo creators who want a repeatable weekly content system',
  tone: 'Practical, energetic, no fluff',
  platform: 'INSTAGRAM_REELS' as const,
};

describe('demo seed helpers', () => {
  it('defaults to creatorai-demo', () => {
    const prev = process.env.AI_MOCK_SEED;
    delete process.env.AI_MOCK_SEED;
    assert.equal(resolveMockSeed(), DEFAULT_AI_MOCK_SEED);
    assert.equal(resolveMockSeed('  custom  '), 'custom');
    if (prev === undefined) delete process.env.AI_MOCK_SEED;
    else process.env.AI_MOCK_SEED = prev;
  });

  it('demoHash is stable and seed-sensitive', () => {
    assert.equal(demoHash('topic', 'a'), demoHash('topic', 'a'));
    assert.notEqual(demoHash('topic', 'a'), demoHash('topic', 'b'));
  });
});

describe('MockAiProvider demo stability (Phase 10 C)', () => {
  it('identical seed + input → identical script / hooks / supporting', async () => {
    const a = new MockAiProvider({ seed: 'judge-demo' });
    const b = new MockAiProvider({ seed: 'judge-demo' });

    const s1 = await a.generateScript(DEMO_INPUT);
    const s2 = await b.generateScript(DEMO_INPUT);
    assert.deepEqual(s1, s2);

    const h1 = await a.generateHooks(s1.fullText, 5);
    const h2 = await b.generateHooks(s1.fullText, 5);
    assert.deepEqual(h1, h2);

    const platforms = ['YOUTUBE', 'TIKTOK', 'INSTAGRAM_REELS'] as const;
    const p1 = await a.generateSupporting(s1.fullText, [...platforms]);
    const p2 = await b.generateSupporting(s1.fullText, [...platforms]);
    assert.deepEqual(p1, p2);
  });

  it('different seeds can change hook lane without Math.random', async () => {
    const a = new MockAiProvider({ seed: 'lane-a' });
    const b = new MockAiProvider({ seed: 'lane-b' });
    const s1 = await a.generateScript(DEMO_INPUT);
    const s2 = await b.generateScript(DEMO_INPUT);
    // Same topic structure; hash lane may differ — assert both are non-empty
    assert.ok(s1.hook.length > 10);
    assert.ok(s2.hook.length > 10);
    // At least one of title/hook/body differs OR they collide (both fine);
    // prove neither relies on wall-clock: re-run a → same as first a.
    const s1b = await a.generateScript(DEMO_INPUT);
    assert.deepEqual(s1, s1b);
  });

  it('transcribe + score + timeline stay stable across two providers', async () => {
    const a = new MockAiProvider({ seed: 'stable' });
    const b = new MockAiProvider({ seed: 'stable' });
    const script = await a.generateScript(DEMO_INPUT);
    const doc = { hook: script.hook, body: script.body, cta: script.cta };

    const t1 = await a.transcribe({ hintText: script.fullText });
    const t2 = await b.transcribe({ hintText: script.fullText });
    assert.deepEqual(t1, t2);

    const clips1 = await a.scoreClipWindows(t1, doc);
    const clips2 = await b.scoreClipWindows(t2, doc);
    assert.deepEqual(clips1, clips2);
    assert.equal(clips1.length, 3);

    const tl1 = await a.proposeTimeline({
      script: doc,
      alignments: [],
      acceptedClips: clips1.map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        titleSuggestion: c.titleSuggestion,
      })),
      sourceAssetId: 'demo-asset',
    });
    const tl2 = await b.proposeTimeline({
      script: doc,
      alignments: [],
      acceptedClips: clips1.map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        titleSuggestion: c.titleSuggestion,
      })),
      sourceAssetId: 'demo-asset',
    });
    assert.deepEqual(tl1, tl2);
  });

  it('createAiProvider(mock) honors mockSeed', async () => {
    const ai = createAiProvider({ provider: 'mock', mockSeed: 'factory-seed' });
    assert.equal(ai.name, 'mock');
    assert.ok('seed' in ai && (ai as MockAiProvider).seed === 'factory-seed');
    const once = await ai.generateScript(DEMO_INPUT);
    const twice = await ai.generateScript(DEMO_INPUT);
    assert.deepEqual(once, twice);
  });
});
