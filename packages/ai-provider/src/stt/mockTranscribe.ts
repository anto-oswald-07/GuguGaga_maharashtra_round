/**
 * Mock STT — builds timestamped TranscriptSegment[] from words
 * (Phase 6 — no audio / no keys required).
 */
import type { Transcript, TranscriptSegment } from '../types';

export type MockTranscribeOptions = {
  /** Milliseconds per word (default 350). Ignored when `durationMs` is set. */
  msPerWord?: number;
  /** Words per segment chunk (default 6). */
  wordsPerSegment?: number;
  /** Start offset ms (default 0). */
  startMs?: number;
  /**
   * When set, word timings are scaled so the last segment ends at
   * `startMs + durationMs` (matches real footage length).
   */
  durationMs?: number;
};

/**
 * Turn plain script/spoken text into deterministic timed segments.
 * Pass `durationMs` to fit the transcript into real media length.
 */
export function mockTranscribeFromText(
  text: string,
  opts: MockTranscribeOptions = {},
): Transcript {
  const wordsPerSegment = Math.max(1, opts.wordsPerSegment ?? 6);
  const startMs = Math.max(0, Math.floor(opts.startMs ?? 0));

  const words = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) {
    return { segments: [] };
  }

  const durationMs =
    typeof opts.durationMs === 'number' &&
    Number.isFinite(opts.durationMs) &&
    opts.durationMs > 0
      ? Math.floor(opts.durationMs)
      : null;

  // Fit words into media length when known; otherwise keep the classic 350ms/word clock.
  const msPerWord =
    durationMs != null
      ? durationMs / words.length
      : (opts.msPerWord ?? 350);

  const segments: TranscriptSegment[] = [];
  let t = startMs;
  for (let i = 0; i < words.length; i += wordsPerSegment) {
    const chunk = words.slice(i, i + wordsPerSegment);
    const isLast = i + wordsPerSegment >= words.length;
    let endMs: number;
    if (durationMs != null && isLast) {
      // Snap final boundary exactly to media end (avoids float drift).
      endMs = startMs + durationMs;
    } else {
      endMs = Math.round(t + chunk.length * msPerWord);
    }
    // Keep contiguous + non-decreasing even on very short clips.
    if (endMs <= t) endMs = t + 1;
    segments.push({
      startMs: t,
      endMs,
      text: chunk.join(' '),
    });
    t = endMs;
  }

  return { segments };
}
