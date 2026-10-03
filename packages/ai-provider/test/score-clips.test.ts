import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  CLIP_MAX_MS,
  CLIP_MIN_MS,
  MockAiProvider,
  buildCandidateWindows,
  mockTranscribeFromText,
  scoreClipWindowsFromTranscript,
  stableDemoClipIdeas,
  type ScriptDoc,
} from '../src/index';

const fixtures = path.join(__dirname, 'fixtures');

function loadFixture(): { script: ScriptDoc; spoken: string } {
  const script = JSON.parse(
    readFileSync(path.join(fixtures, 'sample_script.json'), 'utf8'),
  ) as ScriptDoc;
  const spoken = readFileSync(path.join(fixtures, 'sample_spoken.txt'), 'utf8');
  return { script, spoken };
}

describe('buildCandidateWindows', () => {
  it('stays within 15–60s band', () => {
    const wins = buildCandidateWindows(120_000);
    assert.ok(wins.length > 5);
    for (const w of wins) {
      const dur = w.endMs - w.startMs;
      assert.ok(dur >= CLIP_MIN_MS && dur <= CLIP_MAX_MS);
      assert.ok(w.startMs >= 0);
      assert.ok(w.endMs <= 120_000);
    }
  });
});

describe('scoreClipWindowsFromTranscript', () => {
  it('returns 3 scored candidates from fixture transcript + script', () => {
    const { script, spoken } = loadFixture();
    const { segments } = mockTranscribeFromText(spoken, {
      wordsPerSegment: 6,
      msPerWord: 320,
    });
    const ideas = scoreClipWindowsFromTranscript({ segments }, script, {
      maxCandidates: 3,
    });

    assert.equal(ideas.length, 3);
    for (const idea of ideas) {
      assert.ok(idea.score >= 0 && idea.score <= 1);
      assert.ok(idea.endMs > idea.startMs);
      const dur = idea.endMs - idea.startMs;
      assert.ok(dur >= CLIP_MIN_MS && dur <= CLIP_MAX_MS, `dur=${dur}`);
      assert.ok(idea.titleSuggestion.length > 0);
      assert.ok(idea.rationale.length > 0);
    }

    // Ranked by score descending
    assert.ok(ideas[0]!.score >= ideas[1]!.score);
    assert.ok(ideas[1]!.score >= ideas[2]!.score);

    // Top pair must not nest (0–15 inside 0–30)
    const a = ideas[0]!;
    const b = ideas[1]!;
    const nested =
      (a.startMs >= b.startMs && a.endMs <= b.endMs) ||
      (b.startMs >= a.startMs && b.endMs <= a.endMs);
    assert.equal(nested, false);
    const overlap = Math.max(
      0,
      Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs),
    );
    const union = a.endMs - a.startMs + (b.endMs - b.startMs) - overlap;
    const iou = union === 0 ? 0 : overlap / union;
    assert.ok(iou <= 0.55, `expected diverse top-2, iou=${iou}`);

    // Stable for identical inputs
    const again = scoreClipWindowsFromTranscript({ segments }, script, {
      maxCandidates: 3,
    });
    assert.deepEqual(ideas, again);
  });

  it('falls back to 3 stable demo ideas when transcript empty', () => {
    const script: ScriptDoc = {
      title: 'Batch Reels',
      hook: 'Stop filming one Reel a day.',
      body: 'Pick one topic cluster.',
      cta: 'Comment BATCH.',
    };
    const ideas = scoreClipWindowsFromTranscript({ segments: [] }, script);
    assert.equal(ideas.length, 3);
    assert.deepEqual(ideas, stableDemoClipIdeas(script));
    assert.ok(ideas.every((i) => i.score > 0.5));
  });

  it('MockAiProvider.scoreClipWindows matches pure scorer', async () => {
    const { script, spoken } = loadFixture();
    const { segments } = mockTranscribeFromText(spoken, {
      wordsPerSegment: 6,
      msPerWord: 320,
    });
    const mock = new MockAiProvider();
    const viaProvider = await mock.scoreClipWindows({ segments }, script);
    const viaPure = scoreClipWindowsFromTranscript({ segments }, script, {
      maxCandidates: 3,
    });
    assert.deepEqual(viaProvider, viaPure);
  });
});
