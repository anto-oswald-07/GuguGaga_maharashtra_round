import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  assertValidTimeline,
  editTimelineSchema,
  safeParseTimeline,
  TimelineValidationError,
} from '../src/index';

/** Works for both `test/` (tsx) and `dist/test/` (compiled node --test). */
function resolveFixturesDir(): string {
  const candidates = [
    path.join(__dirname, 'fixtures'),
    path.join(__dirname, '..', '..', 'test', 'fixtures'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

const fixtures = resolveFixturesDir();

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, name), 'utf8'));
}

describe('editTimelineSchema', () => {
  it('accepts valid schemaVersion 1.0 fixture', () => {
    const raw = loadJson('valid-timeline.json');
    const parsed = editTimelineSchema.safeParse(raw);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.schemaVersion, '1.0');
      assert.equal(parsed.data.durationMs, 2000);
      assert.ok(parsed.data.tracks.some((t) => t.type === 'video'));
      assert.ok(parsed.data.tracks.some((t) => t.type === 'text'));
    }
  });

  it('rejects missing schemaVersion', () => {
    const raw = loadJson('invalid-missing-schema.json');
    const parsed = safeParseTimeline(raw);
    assert.equal(parsed.success, false);
  });

  it('rejects srcEndMs <= srcStartMs', () => {
    const raw = loadJson('invalid-bad-clip-range.json');
    const parsed = safeParseTimeline(raw);
    assert.equal(parsed.success, false);
  });

  it('rejects timeline with no video track', () => {
    const raw = {
      schemaVersion: '1.0',
      fps: 30,
      durationMs: 1000,
      tracks: [
        {
          id: 't1',
          type: 'text',
          items: [{ id: 'tx1', text: 'x', startMs: 0, endMs: 500 }],
        },
      ],
      transitions: [],
    };
    assert.equal(safeParseTimeline(raw).success, false);
  });

  it('accepts optional clip label + meta.notes / generatedBy mock', () => {
    const raw = {
      schemaVersion: '1.0',
      fps: 30,
      durationMs: 1000,
      tracks: [
        {
          id: 'v1',
          type: 'video',
          clips: [
            {
              id: 'c1',
              assetId: 'a1',
              srcStartMs: 0,
              srcEndMs: 1000,
              timelineStartMs: 0,
              label: 'open',
            },
          ],
        },
      ],
      transitions: [],
      meta: { generatedBy: 'mock', notes: 'demo' },
    };
    const parsed = safeParseTimeline(raw);
    assert.equal(parsed.success, true);
  });

  it('accepts image stills + parallel audio track', () => {
    const raw = {
      schemaVersion: '1.0',
      fps: 30,
      durationMs: 5000,
      tracks: [
        {
          id: 'v1',
          type: 'video',
          clips: [
            {
              id: 'img1',
              assetId: 'asset-img',
              srcStartMs: 0,
              srcEndMs: 3000,
              timelineStartMs: 0,
              mediaKind: 'image',
              label: 'still',
            },
            {
              id: 'img2',
              assetId: 'asset-img-2',
              srcStartMs: 0,
              srcEndMs: 2000,
              timelineStartMs: 3000,
              mediaKind: 'image',
            },
          ],
        },
        {
          id: 'a1',
          type: 'audio',
          clips: [
            {
              id: 'aud1',
              assetId: 'asset-aud',
              srcStartMs: 0,
              srcEndMs: 5000,
              timelineStartMs: 0,
              label: 'bed',
            },
          ],
        },
      ],
      transitions: [],
    };
    const parsed = safeParseTimeline(raw);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      const video = parsed.data.tracks.find((t) => t.type === 'video');
      assert.ok(video && video.type === 'video');
      assert.equal(video.clips[0]?.mediaKind, 'image');
      assert.ok(parsed.data.tracks.some((t) => t.type === 'audio'));
    }
  });
});

describe('assertValidTimeline', () => {
  it('returns typed timeline for valid input', () => {
    const tl = assertValidTimeline(loadJson('valid-timeline.json'));
    assert.equal(tl.schemaVersion, '1.0');
  });

  it('throws TimelineValidationError for invalid input', () => {
    assert.throws(
      () => assertValidTimeline(loadJson('invalid-missing-schema.json')),
      (err: unknown) => err instanceof TimelineValidationError,
    );
  });
});
