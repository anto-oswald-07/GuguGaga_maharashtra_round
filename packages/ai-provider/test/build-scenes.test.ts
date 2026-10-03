import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildScenesFromScript,
  ensureScriptScenes,
} from '../src/scripts/buildScenes';
import {
  matchScenesToTranscript,
  reviewScenesAgainstTranscript,
  sceneMatchesToClipIdeas,
} from '../src/scenes/reviewAndMatch';

describe('buildScenesFromScript', () => {
  it('derives hook, body points, and CTA scenes', () => {
    const scenes = buildScenesFromScript(
      {
        hook: 'Stop scrolling — your edits are too long.',
        body: 'Cut the first three seconds.\n\nKeep one idea per cut.\n\nEnd on a clear ask.',
        cta: 'Comment READY for the checklist.',
        title: 'Edit faster',
      },
      { deterministic: true },
    );

    assert.ok(scenes.length >= 3);
    assert.equal(scenes[0]?.beatType, 'HOOK');
    assert.equal(scenes[scenes.length - 1]?.beatType, 'CTA');
    assert.ok(scenes.every((s) => s.fulfillment.mode === 'EMPTY'));
    assert.equal(scenes[0]?.id, '00000000-0000-4000-8000-000000000000');
  });

  it('keeps provider scenes when present', () => {
    const existing = buildScenesFromScript(
      { hook: 'H', body: 'B', cta: 'C' },
      { deterministic: true },
    );
    const ensured = ensureScriptScenes({
      hook: 'H2',
      body: 'B2',
      cta: 'C2',
      scenes: existing,
    });
    assert.deepEqual(ensured, existing);
  });
});

describe('reviewAndMatch', () => {
  const scenes = buildScenesFromScript(
    {
      hook: 'Stop scrolling now',
      body: 'Keep one idea per cut and trim hard.',
      cta: 'Comment READY today',
    },
    { deterministic: true },
  );

  const segments = [
    { startMs: 0, endMs: 4000, text: 'Stop scrolling now' },
    {
      startMs: 4000,
      endMs: 14000,
      text: 'Keep one idea per cut and trim hard.',
    },
    { startMs: 14000, endMs: 19000, text: 'Comment READY today' },
  ];

  it('reviews filled scenes with confidence', () => {
    const filled = scenes.map((s) => ({
      ...s,
      fulfillment: {
        mode: 'UPLOAD' as const,
        assetId: '00000000-0000-4000-8000-000000000099',
      },
    }));
    const reviews = reviewScenesAgainstTranscript(filled, segments);
    assert.equal(reviews.length, filled.length);
    assert.ok(reviews.every((r) => r.opinion.length > 0));
    assert.ok(reviews[0]!.matchConfidence > 0.4);
  });

  it('matches scenes to clip ideas with sceneId tags', () => {
    const filled = scenes.map((s) => ({
      ...s,
      fulfillment: {
        mode: 'UPLOAD' as const,
        assetId: '00000000-0000-4000-8000-000000000099',
      },
    }));
    const matches = matchScenesToTranscript(filled, segments);
    const ideas = sceneMatchesToClipIdeas(matches);
    assert.equal(ideas.length, filled.length);
    assert.ok(ideas[0]!.rationale.includes(`sceneId=${filled[0]!.id}`));
    assert.ok(ideas[0]!.endMs > ideas[0]!.startMs);
  });
});
