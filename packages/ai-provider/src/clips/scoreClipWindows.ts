/**
 * Clip window scoring (Phase 7 MVP — SDD §7 / FR-CLP-001).
 * Pure functions — no I/O. Used by all AiProvider implementations.
 *
 * Ranks 15–60s windows from transcript using script cues + heuristics.
 * Mock demos get 3 stable candidates for the same inputs.
 */
import { fuzzyScore, tokenize } from '../align/fuzzyAlign';
import type { ClipIdea, ScriptDoc, Transcript, TranscriptSegment } from '../types';

/** Short-form clip bounds (seconds → ms). */
export const CLIP_MIN_MS = 15_000;
export const CLIP_MAX_MS = 60_000;
/** Prefer ~30s Reels/Shorts windows. */
export const CLIP_TARGET_MS = 30_000;

const DEFAULT_MAX_CANDIDATES = 3;

/** High-signal spoken cues that make good clip opens / mid-hooks. */
const CUE_PATTERNS: Array<{ re: RegExp; weight: number }> = [
  { re: /\bstop\b/i, weight: 0.12 },
  { re: /\bin the next\b/i, weight: 0.1 },
  { re: /\bhow i\b/i, weight: 0.08 },
  { re: /\bfirst\b|\bsecond\b|\bthird\b|\bfourth\b|\bfifth\b/i, weight: 0.1 },
  { re: /\bhook\b|\bbatch\b|\bchecklist\b/i, weight: 0.08 },
  { re: /\bcomment\b|\bsave this\b/i, weight: 0.06 },
  { re: /\?/, weight: 0.05 },
];

export type ScoreClipWindowsOptions = {
  /** How many ideas to return (default 3). */
  maxCandidates?: number;
  minMs?: number;
  maxMs?: number;
  targetMs?: number;
};

function transcriptDurationMs(segments: TranscriptSegment[]): number {
  if (segments.length === 0) return 0;
  return Math.max(...segments.map((s) => s.endMs));
}

/** Concatenate segment text overlapping [startMs, endMs]. */
export function windowText(
  segments: TranscriptSegment[],
  startMs: number,
  endMs: number,
): string {
  const parts: string[] = [];
  for (const s of segments) {
    if (s.endMs <= startMs || s.startMs >= endMs) continue;
    parts.push(s.text.trim());
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function durationFit(durationMs: number, targetMs: number, minMs: number, maxMs: number): number {
  if (durationMs < minMs || durationMs > maxMs) return 0;
  const span = Math.max(1, maxMs - minMs);
  const dist = Math.abs(durationMs - targetMs) / span;
  return Math.max(0, 1 - dist);
}

function cueBoost(text: string): number {
  let boost = 0;
  for (const { re, weight } of CUE_PATTERNS) {
    if (re.test(text)) boost += weight;
  }
  return Math.min(0.35, boost);
}

function scriptCueScore(text: string, script: ScriptDoc): number {
  const hook = fuzzyScore(script.hook || '', text);
  const cta = fuzzyScore(script.cta || '', text);
  // Sample first body paragraph as mid-story cue
  const bodyFirst = (script.body || '').split(/\n\n+/)[0] ?? '';
  const body = fuzzyScore(bodyFirst, text);
  // Hook opens win demos; blend with body/CTA
  return Math.min(1, hook * 0.5 + body * 0.35 + cta * 0.15);
}

function titleFromText(text: string, rank: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return `Clip idea ${rank}`;
  // Prefer first sentence / clause up to ~56 chars
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  const clipped =
    sentence.length <= 56 ? sentence : `${sentence.slice(0, 53).trim()}…`;
  // Drop trailing punctuation for title feel
  return clipped.replace(/[.!?]+$/, '') || `Clip idea ${rank}`;
}

function rationaleFor(
  score: number,
  durationMs: number,
  scriptScore: number,
  cues: number,
): string {
  const bits: string[] = [];
  if (scriptScore >= 0.45) bits.push('strong script cue overlap');
  else if (scriptScore >= 0.25) bits.push('partial script overlap');
  if (cues >= 0.1) bits.push('spoken hook/list cues');
  const secs = Math.round(durationMs / 1000);
  bits.push(`${secs}s window (15–60s band)`);
  bits.push(`score ${score.toFixed(2)}`);
  return bits.join('; ');
}

type ScoredWindow = {
  startMs: number;
  endMs: number;
  score: number;
  text: string;
  scriptScore: number;
  cues: number;
};

/**
 * Build candidate [start,end] windows stepped across the transcript.
 * Durations: 15 / 30 / 45 / 60s (clamped to available length).
 */
export function buildCandidateWindows(
  durationMs: number,
  opts?: { minMs?: number; maxMs?: number; stepMs?: number },
): Array<{ startMs: number; endMs: number }> {
  const minMs = opts?.minMs ?? CLIP_MIN_MS;
  const maxMs = opts?.maxMs ?? CLIP_MAX_MS;
  const stepMs = opts?.stepMs ?? 5_000;

  if (durationMs <= 0) return [];

  const lengths = [15_000, 30_000, 45_000, 60_000].filter(
    (L) => L >= minMs && L <= maxMs,
  );
  const out: Array<{ startMs: number; endMs: number }> = [];
  const seen = new Set<string>();

  for (const L of lengths) {
    if (durationMs < L) {
      // Short footage: one window spanning available length if still ≥ min
      if (durationMs >= minMs) {
        const key = `0-${durationMs}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ startMs: 0, endMs: durationMs });
        }
      }
      continue;
    }
    for (let start = 0; start + L <= durationMs; start += stepMs) {
      const end = start + L;
      const key = `${start}-${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ startMs: start, endMs: end });
    }
    // Always include end-aligned window of this length
    const endStart = Math.max(0, durationMs - L);
    const key = `${endStart}-${durationMs}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ startMs: endStart, endMs: durationMs });
    }
  }

  return out;
}

/**
 * When transcript is empty / too short, return 3 stable demo candidates
 * so UI/e2e always have something to show.
 */
export function stableDemoClipIdeas(script: ScriptDoc): ClipIdea[] {
  const topicBit =
    tokenize(script.title || script.hook || 'creator tip')
      .slice(0, 4)
      .join(' ') || 'creator tip';
  const titleBase = topicBit
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return [
    {
      startMs: 0,
      endMs: 20_000,
      score: 0.82,
      titleSuggestion: `${titleBase} — cold open`,
      rationale: 'stable demo: hook window (no/short transcript)',
    },
    {
      startMs: 25_000,
      endMs: 55_000,
      score: 0.74,
      titleSuggestion: `${titleBase} — mid tip`,
      rationale: 'stable demo: body tip window (no/short transcript)',
    },
    {
      startMs: 60_000,
      endMs: 90_000,
      score: 0.68,
      titleSuggestion: `${titleBase} — CTA beat`,
      rationale: 'stable demo: CTA window (no/short transcript)',
    },
  ];
}

/** Intersection-over-union for two [start,end) windows. */
function windowIoU(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): number {
  const overlap = Math.max(
    0,
    Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs),
  );
  const union = a.endMs - a.startMs + (b.endMs - b.startMs) - overlap;
  return union <= 0 ? 0 : overlap / union;
}

function isNested(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): boolean {
  return (
    (a.startMs >= b.startMs && a.endMs <= b.endMs) ||
    (b.startMs >= a.startMs && b.endMs <= a.endMs)
  );
}

/**
 * Greedy non-max suppression by score, then fill by lowest IoU / non-nested
 * so demos get 3 distinct-ish windows.
 */
function pickTopNonOverlapping(
  scored: ScoredWindow[],
  max: number,
): ScoredWindow[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const picked: ScoredWindow[] = [];

  // Pass 1 — strict diversity
  for (const cand of sorted) {
    if (picked.length >= max) break;
    const ok = picked.every(
      (p) => windowIoU(cand, p) <= 0.35 && !isNested(cand, p),
    );
    if (ok) picked.push(cand);
  }

  // Pass 2 — fill preferring least overlap / avoid nesting
  while (picked.length < max) {
    let best: ScoredWindow | null = null;
    let bestKey = Number.POSITIVE_INFINITY;
    for (const cand of sorted) {
      if (picked.includes(cand)) continue;
      const maxIou = picked.reduce(
        (m, p) => Math.max(m, windowIoU(cand, p)),
        0,
      );
      const nested = picked.some((p) => isNested(cand, p));
      // Nested windows are heavily penalized so 0–15s won't join 0–30s
      const key = (nested ? 5 : 0) + maxIou - cand.score * 0.01;
      if (key < bestKey) {
        bestKey = key;
        best = cand;
      }
    }
    if (!best) break;
    picked.push(best);
  }

  // Rank by score (UI lists highest first); stable for equal scores via startMs
  return picked.sort(
    (a, b) => b.score - a.score || a.startMs - b.startMs,
  );
}

/**
 * Rank 15–60s windows; return top N ClipIdea (default 3).
 * Deterministic for identical transcript + script.
 */
export function scoreClipWindowsFromTranscript(
  transcript: Transcript,
  script: ScriptDoc,
  opts: ScoreClipWindowsOptions = {},
): ClipIdea[] {
  const maxCandidates = Math.max(1, Math.min(opts.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 10));
  const minMs = opts.minMs ?? CLIP_MIN_MS;
  const maxMs = opts.maxMs ?? CLIP_MAX_MS;
  const targetMs = opts.targetMs ?? CLIP_TARGET_MS;

  const segments = transcript.segments ?? [];
  const durationMs = transcriptDurationMs(segments);

  if (segments.length === 0 || durationMs < minMs) {
    return stableDemoClipIdeas(script).slice(0, maxCandidates);
  }

  const windows = buildCandidateWindows(durationMs, { minMs, maxMs });
  const scored: ScoredWindow[] = [];

  for (const w of windows) {
    const text = windowText(segments, w.startMs, w.endMs);
    if (!text || tokenize(text).length < 4) continue;

    const dur = w.endMs - w.startMs;
    const fit = durationFit(dur, targetMs, minMs, maxMs);
    const scriptScore = scriptCueScore(text, script);
    const cues = cueBoost(text);
    // Prefer windows that start near a segment boundary with cue words
    const openBoost = cueBoost(text.slice(0, 80)) * 0.5;

    const score = Math.min(
      1,
      Math.max(0.05, scriptScore * 0.55 + fit * 0.25 + cues * 0.15 + openBoost),
    );

    scored.push({
      startMs: w.startMs,
      endMs: w.endMs,
      score,
      text,
      scriptScore,
      cues,
    });
  }

  if (scored.length === 0) {
    return stableDemoClipIdeas(script).slice(0, maxCandidates);
  }

  const picked = pickTopNonOverlapping(scored, maxCandidates);

  return picked.map((p, i) => ({
    startMs: p.startMs,
    endMs: p.endMs,
    score: Math.round(p.score * 1000) / 1000,
    titleSuggestion: titleFromText(p.text, i + 1),
    rationale: rationaleFor(p.score, p.endMs - p.startMs, p.scriptScore, p.cues),
  }));
}
