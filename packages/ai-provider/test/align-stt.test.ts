import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  fuzzyAlignScriptToTranscript,
  fuzzyScore,
  jaccardTokens,
  mockTranscribeFromText,
  scriptToExcerpts,
  tokenize,
  type ScriptDoc,
} from '../src/index';

const fixtures = path.join(__dirname, 'fixtures');

describe('tokenize / jaccard', () => {
  it('normalizes punctuation', () => {
    assert.deepEqual(tokenize('Hello, WORLD!'), ['hello', 'world']);
  });

  it('scores identical sets as 1', () => {
    assert.equal(jaccardTokens(['a', 'b'], ['b', 'a']), 1);
  });

  it('fuzzyScore is high for near paraphrase', () => {
    const s = fuzzyScore(
      'pick one topic cluster for the week',
      'First pick one topic cluster for the week',
    );
    assert.ok(s >= 0.6, `expected >=0.6 got ${s}`);
  });

  it('fuzzyScore is low for unrelated text', () => {
    const s = fuzzyScore('batch reels afternoon', 'weather forecast tomorrow rain');
    assert.ok(s < 0.35, `expected low got ${s}`);
  });
});

describe('mockTranscribeFromText', () => {
  it('builds timed segments from fixture spoken text', () => {
    const spoken = readFileSync(
      path.join(fixtures, 'sample_spoken.txt'),
      'utf8',
    );
    const { segments } = mockTranscribeFromText(spoken, {
      wordsPerSegment: 5,
      msPerWord: 300,
    });
    assert.ok(segments.length > 5);
    assert.equal(segments[0]!.startMs, 0);
    assert.ok(segments[0]!.endMs > segments[0]!.startMs);
    const last = segments[segments.length - 1]!;
    assert.ok(last.endMs > 0);
    // Contiguous
    for (let i = 1; i < segments.length; i += 1) {
      assert.equal(segments[i]!.startMs, segments[i - 1]!.endMs);
    }
  });

  it('fits segments into durationMs when provided', () => {
    const { segments } = mockTranscribeFromText(
      'one two three four five six seven eight nine ten eleven twelve',
      { durationMs: 5000, wordsPerSegment: 4 },
    );
    assert.ok(segments.length >= 2);
    assert.equal(segments[0]!.startMs, 0);
    assert.equal(segments[segments.length - 1]!.endMs, 5000);
    for (let i = 1; i < segments.length; i += 1) {
      assert.equal(segments[i]!.startMs, segments[i - 1]!.endMs);
      assert.ok(segments[i]!.endMs > segments[i]!.startMs);
    }
  });
});

describe('fuzzyAlignScriptToTranscript', () => {
  it('aligns sample script to mock transcript with confidence 0–1', () => {
    const script = JSON.parse(
      readFileSync(path.join(fixtures, 'sample_script.json'), 'utf8'),
    ) as ScriptDoc;
    const spoken = readFileSync(
      path.join(fixtures, 'sample_spoken.txt'),
      'utf8',
    );
    const { segments } = mockTranscribeFromText(spoken, {
      wordsPerSegment: 6,
      msPerWord: 320,
    });

    const excerpts = scriptToExcerpts(script);
    assert.ok(excerpts.length >= 3);

    const alignments = fuzzyAlignScriptToTranscript(script, segments);
    assert.ok(alignments.length >= 3);
    assert.equal(alignments.length, excerpts.length);

    for (const a of alignments) {
      assert.ok(a.confidence >= 0 && a.confidence <= 1);
      assert.ok(a.endMs >= a.startMs);
      assert.ok(a.scriptExcerpt.length > 0);
    }

    // At least one high-confidence match on shared phrasing
    const maxConf = Math.max(...alignments.map((a) => a.confidence));
    assert.ok(maxConf >= 0.45, `expected a decent match, max=${maxConf}`);
  });

  it('returns empty when no segments', () => {
    const script: ScriptDoc = {
      hook: 'Hello world this is a hook sentence.',
      body: 'Body sentence one is long enough.',
      cta: 'Comment READY please now.',
    };
    assert.deepEqual(fuzzyAlignScriptToTranscript(script, []), []);
  });
});
