import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { Platform } from '@creatorai/shared';
import {
  MockAiProvider,
  PLATFORM_COPY_LIMITS,
  buildPlatformCopyItem,
  clampCopy,
  clampSupportingItem,
  generatePlatformCopyFromScript,
  limitsForPlatform,
  normalizeHashtag,
} from '../src/index';

const fixtures = path.join(__dirname, 'fixtures');

function loadFixture(): { script: string; platforms: Platform[] } {
  return JSON.parse(
    readFileSync(path.join(fixtures, 'sample_platform_copy.json'), 'utf8'),
  ) as { script: string; platforms: Platform[] };
}

describe('copyLimits', () => {
  it('exposes soft limits for every Platform', () => {
    const platforms: Platform[] = [
      'YOUTUBE',
      'YOUTUBE_SHORTS',
      'INSTAGRAM_REELS',
      'TIKTOK',
      'LINKEDIN',
    ];
    for (const p of platforms) {
      const limits = limitsForPlatform(p);
      assert.equal(limits, PLATFORM_COPY_LIMITS[p]);
      assert.ok(limits.titleMax > 0);
      assert.ok(limits.captionMax > 0);
      assert.ok(limits.hashtagMax > 0);
      assert.ok(limits.demoLabel.startsWith('['));
    }
  });

  it('clampCopy truncates on a word boundary when possible', () => {
    const out = clampCopy('hello world again', 12);
    assert.ok(out.length <= 12);
    assert.ok(out.endsWith('…'));
    assert.equal(clampCopy('short', 100), 'short');
  });

  it('normalizeHashtag strips spaces and adds #', () => {
    assert.equal(normalizeHashtag('##foo bar'), '#foobar');
    assert.equal(normalizeHashtag(''), '');
  });
});

describe('generatePlatformCopyFromScript', () => {
  it('returns distinct clamped copy per platform from fixture', () => {
    const { script, platforms } = loadFixture();
    const result = generatePlatformCopyFromScript(script, platforms);

    assert.equal(result.provider, 'mock');
    for (const p of platforms) {
      const item = result.byPlatform[p];
      assert.ok(item, `missing ${p}`);
      const limits = limitsForPlatform(p);
      assert.ok(item!.titles.length >= 1);
      assert.ok(item!.captions.length >= 1);
      assert.ok(item!.hashtags.length >= 1);
      assert.ok(item!.hashtags.length <= limits.hashtagMax);
      for (const t of item!.titles) {
        assert.ok(t.length <= limits.titleMax, `${p} title len ${t.length}`);
        assert.ok(t.includes(limits.demoLabel), `${p} missing demo label`);
      }
      for (const c of item!.captions) {
        assert.ok(c.length <= limits.captionMax, `${p} caption len ${c.length}`);
      }
      for (const h of item!.hashtags) {
        assert.ok(h.startsWith('#'));
      }
    }

    // Labels must differ across platforms so packs are visually distinct
    const labels = platforms.map(
      (p) => result.byPlatform[p]!.titles[0]!,
    );
    assert.equal(new Set(labels).size, labels.length);
  });

  it('is deterministic for identical inputs', () => {
    const { script, platforms } = loadFixture();
    const a = generatePlatformCopyFromScript(script, platforms);
    const b = generatePlatformCopyFromScript(script, platforms);
    assert.deepEqual(a, b);
  });

  it('defaults to YOUTUBE_SHORTS when platforms empty', () => {
    const result = generatePlatformCopyFromScript('## Hook\n\nBatch tips', []);
    assert.ok(result.byPlatform.YOUTUBE_SHORTS);
    assert.equal(Object.keys(result.byPlatform).length, 1);
  });

  it('MockAiProvider.generateSupporting matches pure builder', async () => {
    const { script, platforms } = loadFixture();
    const mock = new MockAiProvider();
    const viaProvider = await mock.generateSupporting(script, platforms);
    const viaPure = generatePlatformCopyFromScript(script, platforms);
    assert.deepEqual(viaProvider, viaPure);
  });
});

describe('clampSupportingItem', () => {
  it('enforces title/caption/hashtag soft limits', () => {
    const clamped = clampSupportingItem('TIKTOK', {
      titles: ['x'.repeat(200)],
      captions: ['y'.repeat(500)],
      hashtags: [
        '#a',
        '#b',
        '#c',
        '#d',
        '#e',
        '#f',
        '#g',
        '#h',
      ],
    });
    const limits = limitsForPlatform('TIKTOK');
    assert.ok(clamped.titles[0]!.length <= limits.titleMax);
    assert.ok(clamped.captions[0]!.length <= limits.captionMax);
    assert.equal(clamped.hashtags.length, limits.hashtagMax);
  });

  it('buildPlatformCopyItem already respects limits', () => {
    const item = buildPlatformCopyItem(
      '## Hook\n\nStop filming one Reel a day.',
      'INSTAGRAM_REELS',
    );
    const limits = limitsForPlatform('INSTAGRAM_REELS');
    for (const t of item.titles) assert.ok(t.length <= limits.titleMax);
    for (const c of item.captions) assert.ok(c.length <= limits.captionMax);
    assert.ok(item.hashtags.length <= limits.hashtagMax);
  });
});
