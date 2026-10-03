import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  DEMO_SOURCE_ASSET_ID,
  HOOK_OVERLAY_END_MS,
  HOOK_OVERLAY_START_MS,
  MockAiProvider,
  assertValidTimelineShape,
  proposeTimelineFromContext,
  stableDemoAcceptedClips,
  stableDemoTimeline,
  type EditTimeline,
  type ScriptDoc,
  type TimelineContext,
  type TimelineVideoTrack,
} from '../src/index';

const fixtures = path.join(__dirname, 'fixtures');

function loadContextFixture(): TimelineContext {
  return JSON.parse(
    readFileSync(path.join(fixtures, 'sample_timeline_context.json'), 'utf8'),
  ) as TimelineContext;
}

function videoTrack(tl: EditTimeline): TimelineVideoTrack {
  const t = tl.tracks.find((x) => x.type === 'video');
  assert.ok(t && t.type === 'video');
  return t;
}

describe('proposeTimelineFromContext', () => {
  it('builds valid SDD timeline from accepted clips + hook 0–3s', () => {
    const ctx = loadContextFixture();
    const tl = proposeTimelineFromContext(ctx);

    assert.equal(tl.schemaVersion, '1.0');
    assert.equal(tl.fps, 30);
    assert.equal(tl.durationMs, 40_000); // 12s + 16s + 12s
    assert.equal(tl.meta.generatedBy, 'ai');
    assertValidTimelineShape(tl);

    const video = videoTrack(tl);
    assert.equal(video.clips.length, 3);
    assert.equal(video.clips[0]!.id, 'clip-a');
    assert.equal(video.clips[0]!.assetId, ctx.sourceAssetId);
    assert.equal(video.clips[0]!.srcStartMs, 0);
    assert.equal(video.clips[0]!.srcEndMs, 12_000);
    assert.equal(video.clips[0]!.timelineStartMs, 0);
    assert.equal(video.clips[1]!.timelineStartMs, 12_000);
    assert.equal(video.clips[2]!.timelineStartMs, 28_000);

    const text = tl.tracks.find((t) => t.type === 'text');
    assert.ok(text && text.type === 'text');
    const hook = text.items.find((i) => i.id === 'tx-hook');
    assert.ok(hook);
    assert.equal(hook.startMs, HOOK_OVERLAY_START_MS);
    assert.equal(hook.endMs, HOOK_OVERLAY_END_MS);
    assert.ok(hook.text.includes('Stop filming') || hook.text.length > 0);

    const caps = tl.tracks.find((t) => t.type === 'captions');
    assert.ok(caps && caps.type === 'captions');
    // low-confidence alignment filtered out
    assert.equal(caps.items.length, 2);
    assert.equal(caps.items[0]!.text, 'Stop filming one Reel a day');
  });

  it('is stable for identical inputs', () => {
    const ctx = loadContextFixture();
    const a = proposeTimelineFromContext(ctx);
    const b = proposeTimelineFromContext(ctx);
    assert.deepEqual(a, b);
  });

  it('falls back to stable demo clips when context has none', () => {
    const script: ScriptDoc = {
      title: 'Batch Reels',
      hook: 'Stop filming one Reel a day.',
      body: 'Pick one topic cluster.',
      cta: 'Comment BATCH.',
    };
    const tl = proposeTimelineFromContext({ script });
    assertValidTimelineShape(tl);
    const video = videoTrack(tl);
    assert.equal(video.clips.length, 3);
    assert.equal(video.clips[0]!.assetId, DEMO_SOURCE_ASSET_ID);
    assert.deepEqual(
      video.clips.map((c) => ({
        id: c.id,
        srcStartMs: c.srcStartMs,
        srcEndMs: c.srcEndMs,
      })),
      stableDemoAcceptedClips(script).map((c) => ({
        id: c.id,
        srcStartMs: c.startMs,
        srcEndMs: c.endMs,
      })),
    );
    assert.equal(tl.durationMs, 50_000);
  });

  it('uses clipIdeas when acceptedClips omitted', () => {
    const script: ScriptDoc = {
      hook: 'Hook text for overlay.',
      body: 'Body.',
      cta: 'CTA.',
    };
    const tl = proposeTimelineFromContext({
      script,
      sourceAssetId: '22222222-2222-4222-8222-222222222222',
      clipIdeas: [
        {
          startMs: 1000,
          endMs: 5000,
          score: 0.9,
          titleSuggestion: 'Idea A',
          rationale: 'test',
        },
        {
          startMs: 8000,
          endMs: 12000,
          score: 0.8,
          titleSuggestion: 'Idea B',
          rationale: 'test',
        },
      ],
    });
    const video = videoTrack(tl);
    assert.equal(video.clips.length, 2);
    assert.equal(video.clips[0]!.srcStartMs, 1000);
    assert.equal(video.clips[0]!.srcEndMs, 5000);
    assert.equal(video.clips[0]!.timelineStartMs, 0);
    assert.equal(video.clips[1]!.timelineStartMs, 4000);
    assert.equal(tl.durationMs, 8000);
  });

  it('stableDemoTimeline matches empty-context proposal', () => {
    const script: ScriptDoc = {
      title: 'How I Batch-Create Reels in One Afternoon',
      hook: 'Stop filming one Reel a day. Batch a week in one afternoon.',
      body: 'Pick one topic. Film all A-roll. Edit decisions, not hunting.',
      cta: 'Comment BATCH for the checklist.',
    };
    assert.deepEqual(stableDemoTimeline(script), proposeTimelineFromContext({ script }));
  });

  it('MockAiProvider.proposeTimeline matches pure builder', async () => {
    const ctx = loadContextFixture();
    const mock = new MockAiProvider();
    const viaProvider = await mock.proposeTimeline(ctx);
    const viaPure = proposeTimelineFromContext(ctx);
    assert.deepEqual(viaProvider, viaPure);
  });

  it('assertValidTimelineShape rejects bad schemaVersion', () => {
    const tl = proposeTimelineFromContext(loadContextFixture());
    assert.throws(
      () =>
        assertValidTimelineShape({
          ...tl,
          schemaVersion: '9.9' as '1.0',
        }),
      /schemaVersion/,
    );
  });
});
