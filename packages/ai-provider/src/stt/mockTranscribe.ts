/**
 * Mock STT — builds timestamped TranscriptSegment[] from words
 * (Phase 6 — no audio / no keys required).
 */
import type { Transcript, TranscriptSegment } from '../types';

export type MockTranscribeOptions = {
  /** Milliseconds per word (default 350). */
  msPerWord?: number;
  /** Words per segment chunk (default 6). */
  wordsPerSegment?: number;
  /** Start offset ms (default 0). */
  startMs?: number;
};

/**
 * Turn plain script/spoken text into deterministic timed segments.
 */
export function mockTranscribeFromText(
  text: string,
  opts: MockTranscribeOptions = {},
): Transcript {
  const msPerWord = opts.msPerWord ?? 350;
  const wordsPerSegment = Math.max(1, opts.wordsPerSegment ?? 6);
  const startMs = opts.startMs ?? 0;

  const words = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) {
    return { segments: [] };
  }

  const segments: TranscriptSegment[] = [];
  let t = startMs;
  for (let i = 0; i < words.length; i += wordsPerSegment) {
    const chunk = words.slice(i, i + wordsPerSegment);
    const dur = chunk.length * msPerWord;
    segments.push({
      startMs: t,
      endMs: t + dur,
      text: chunk.join(' '),
    });
    t += dur;
  }

  return { segments };
}
