/**
 * Fuzzy script↔transcript alignment (Phase 6 MVP — SDD §7.3).
 * Pure functions — no I/O. Used by all AiProvider implementations.
 */
import type { Alignment, ScriptDoc, TranscriptSegment } from '../types';

/** Normalize for matching: lowercase, strip punctuation, collapse space. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalizeText(s);
  return n ? n.split(' ') : [];
}

/** Jaccard similarity on token sets — 0..1. */
export function jaccardTokens(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Sequence overlap: fraction of query tokens found in order in candidate
 * (allows gaps). Rewards contiguous-ish matches without full equality.
 */
export function orderedOverlap(query: string[], candidate: string[]): number {
  if (query.length === 0) return 1;
  if (candidate.length === 0) return 0;
  let qi = 0;
  for (const c of candidate) {
    if (c === query[qi]) {
      qi += 1;
      if (qi >= query.length) break;
    }
  }
  return qi / query.length;
}

/** Combined fuzzy score 0..1. */
export function fuzzyScore(excerpt: string, windowText: string): number {
  const q = tokenize(excerpt);
  const c = tokenize(windowText);
  const jac = jaccardTokens(q, c);
  const ord = orderedOverlap(q, c);
  // Prefer ordered overlap for spoken paraphrase; blend with Jaccard
  return Math.min(1, jac * 0.45 + ord * 0.55);
}

/** Split script into alignable excerpts (hook / body sentences / CTA). */
export function scriptToExcerpts(script: ScriptDoc): string[] {
  const parts: string[] = [];
  const pushSentences = (block: string | undefined) => {
    if (!block?.trim()) return;
    const sentences = block
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8);
    if (sentences.length === 0) {
      parts.push(block.trim());
    } else {
      parts.push(...sentences);
    }
  };
  pushSentences(script.hook);
  pushSentences(script.body);
  pushSentences(script.cta);
  return parts;
}

type Window = {
  startIdx: number;
  endIdx: number;
  startMs: number;
  endMs: number;
  text: string;
};

/** Build sliding windows of 1..maxSpan consecutive segments. */
function buildWindows(
  segments: TranscriptSegment[],
  maxSpan: number,
): Window[] {
  const windows: Window[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    for (let span = 1; span <= maxSpan && i + span <= segments.length; span += 1) {
      const slice = segments.slice(i, i + span);
      const first = slice[0]!;
      const last = slice[slice.length - 1]!;
      windows.push({
        startIdx: i,
        endIdx: i + span - 1,
        startMs: first.startMs,
        endMs: last.endMs,
        text: slice.map((s) => s.text).join(' '),
      });
    }
  }
  return windows;
}

export type FuzzyAlignOptions = {
  /** Max consecutive segments in a candidate window (default 4). */
  maxSpan?: number;
  /** Drop alignments below this confidence (default 0.25). */
  minConfidence?: number;
  /** Prefer non-overlapping windows in time order (default true). */
  greedyNonOverlap?: boolean;
};

/**
 * Align each script excerpt to the best-matching transcript window.
 * Confidence is fuzzyScore ∈ [0, 1].
 */
export function fuzzyAlignScriptToTranscript(
  script: ScriptDoc,
  segments: TranscriptSegment[],
  opts: FuzzyAlignOptions = {},
): Alignment[] {
  const maxSpan = opts.maxSpan ?? 4;
  const minConfidence = opts.minConfidence ?? 0.25;
  const greedy = opts.greedyNonOverlap !== false;

  if (segments.length === 0) return [];

  const excerpts = scriptToExcerpts(script);
  if (excerpts.length === 0) return [];

  const windows = buildWindows(segments, maxSpan);
  const used = new Set<number>(); // segment indices claimed
  const alignments: Alignment[] = [];

  for (const excerpt of excerpts) {
    let best: { window: Window; score: number } | null = null;
    for (const w of windows) {
      if (greedy) {
        let conflict = false;
        for (let i = w.startIdx; i <= w.endIdx; i += 1) {
          if (used.has(i)) {
            conflict = true;
            break;
          }
        }
        if (conflict) continue;
      }
      const score = fuzzyScore(excerpt, w.text);
      if (!best || score > best.score) {
        best = { window: w, score };
      }
    }

    if (!best || best.score < minConfidence) {
      // Still emit low-confidence placeholder using a nearby unused span
      const fallback =
        windows.find((w) => {
          for (let i = w.startIdx; i <= w.endIdx; i += 1) {
            if (used.has(i)) return false;
          }
          return true;
        }) ?? windows[0]!;
      alignments.push({
        scriptExcerpt: excerpt,
        startMs: fallback.startMs,
        endMs: fallback.endMs,
        confidence: Math.max(0, Math.min(1, best?.score ?? 0.1)),
      });
      if (greedy) {
        for (let i = fallback.startIdx; i <= fallback.endIdx; i += 1) {
          used.add(i);
        }
      }
      continue;
    }

    alignments.push({
      scriptExcerpt: excerpt,
      startMs: best.window.startMs,
      endMs: best.window.endMs,
      confidence: Math.max(0, Math.min(1, best.score)),
    });
    if (greedy) {
      for (let i = best.window.startIdx; i <= best.window.endIdx; i += 1) {
        used.add(i);
      }
    }
  }

  return alignments;
}
