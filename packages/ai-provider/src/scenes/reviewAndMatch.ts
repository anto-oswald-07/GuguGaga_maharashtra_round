/**
 * Scene ↔ transcript review + match/trim helpers (scene pipeline).
 * Pure functions — used by REVIEW_FOOTAGE and MATCH_SCENES jobs.
 */
import { fuzzyScore } from '../align/fuzzyAlign';
import { windowText } from '../clips/scoreClipWindows';
import type { ClipIdea, TranscriptSegment } from '../types';
import type { ScriptScene } from '@creatorai/shared';

export type SceneReviewResult = {
  sceneId: string;
  opinion: string;
  matchConfidence: number;
};

export type SceneMatchResult = {
  sceneId: string;
  startMs: number;
  endMs: number;
  score: number;
  titleSuggestion: string;
  rationale: string;
};

function transcriptDurationMs(segments: TranscriptSegment[]): number {
  if (segments.length === 0) return 0;
  return Math.max(...segments.map((s) => s.endMs));
}

/**
 * Score a sliding window sized near the scene's target duration.
 */
function bestWindowForScene(
  scene: ScriptScene,
  segments: TranscriptSegment[],
): { startMs: number; endMs: number; score: number; text: string } {
  const durationMs = transcriptDurationMs(segments);
  if (durationMs <= 0 || segments.length === 0) {
    const end = Math.max(1000, scene.targetDurationMs);
    return { startMs: 0, endMs: end, score: 0.2, text: '' };
  }

  const target = Math.min(
    Math.max(3_000, scene.targetDurationMs),
    Math.min(60_000, durationMs),
  );
  const step = Math.max(500, Math.floor(target / 4));
  let best = {
    startMs: 0,
    endMs: Math.min(target, durationMs),
    score: 0,
    text: '',
  };

  for (let start = 0; start + Math.min(target, durationMs) <= durationMs + 1; start += step) {
    const end = Math.min(durationMs, start + target);
    if (end - start < 2_000) break;
    const text = windowText(segments, start, end);
    const score = fuzzyScore(scene.spokenText, text);
    if (score > best.score) {
      best = { startMs: start, endMs: end, score, text };
    }
  }

  // Also try aligning to the first segment that overlaps well with early words.
  if (best.score < 0.35) {
    const full = windowText(segments, 0, durationMs);
    const score = fuzzyScore(scene.spokenText, full);
    if (score > best.score) {
      best = {
        startMs: 0,
        endMs: Math.min(durationMs, target),
        score: Math.max(score * 0.85, best.score),
        text: windowText(segments, 0, Math.min(durationMs, target)),
      };
    }
  }

  return best;
}

function opinionFor(
  scene: ScriptScene,
  score: number,
  windowSnippet: string,
): string {
  const label = scene.title || `Scene ${scene.ordinal + 1}`;
  if (!windowSnippet.trim()) {
    return `${label}: no usable transcript yet — upload clearer audio or re-transcribe before trimming.`;
  }
  if (score >= 0.72) {
    return `${label}: strong match to the spoken plan ("${scene.spokenText.slice(0, 60)}…"). Ready to auto-trim.`;
  }
  if (score >= 0.45) {
    return `${label}: partial match. Coverage is usable but the take may paraphrase the script — review the trim before accepting.`;
  }
  if (score >= 0.25) {
    return `${label}: weak match. Footage may be the wrong take or the transcript is noisy — consider re-filming or regenerating this scene.`;
  }
  return `${label}: poor match to the brief (${scene.visualBrief.slice(0, 80)}). Prefer a new upload or AI placeholder.`;
}

/** Review filled scenes against transcript text. */
export function reviewScenesAgainstTranscript(
  scenes: ScriptScene[],
  segments: TranscriptSegment[],
): SceneReviewResult[] {
  return scenes.map((scene) => {
    if (scene.fulfillment?.mode === 'EMPTY' || !scene.fulfillment?.assetId) {
      return {
        sceneId: scene.id,
        opinion: `${scene.title}: still empty — upload footage or generate an AI placeholder.`,
        matchConfidence: 0,
      };
    }
    const best = bestWindowForScene(scene, segments);
    return {
      sceneId: scene.id,
      opinion: opinionFor(scene, best.score, best.text),
      matchConfidence: Math.round(best.score * 1000) / 1000,
    };
  });
}

/**
 * Propose trim windows per scene (becomes ClipCandidate via MATCH_SCENES).
 * Only scenes with non-EMPTY fulfillment are matched.
 */
export function matchScenesToTranscript(
  scenes: ScriptScene[],
  segments: TranscriptSegment[],
): SceneMatchResult[] {
  const out: SceneMatchResult[] = [];
  let cursor = 0;
  const durationMs = transcriptDurationMs(segments);

  for (const scene of scenes) {
    if (scene.fulfillment?.mode === 'EMPTY') continue;

    const best = bestWindowForScene(scene, segments);
    let startMs = best.startMs;
    let endMs = best.endMs;
    let score = best.score;

    // If fuzzy match is weak, fall back to sequential packing so demos still trim.
    if (score < 0.3 && durationMs > 0) {
      const len = Math.min(
        Math.max(3_000, scene.targetDurationMs),
        Math.max(3_000, durationMs - cursor),
      );
      startMs = cursor;
      endMs = Math.min(durationMs, cursor + len);
      score = Math.max(score, 0.35);
      cursor = endMs;
    } else {
      cursor = Math.max(cursor, endMs);
    }

    out.push({
      sceneId: scene.id,
      startMs,
      endMs,
      score: Math.round(Math.min(1, Math.max(0.15, score)) * 1000) / 1000,
      titleSuggestion: scene.title,
      rationale: `Auto-trimmed to scene plan (${scene.beatType}): ${scene.spokenText.slice(0, 120)}`,
    });
  }

  return out;
}

/** Convert match results into ClipIdea shape used by persistClipCandidates. */
export function sceneMatchesToClipIdeas(matches: SceneMatchResult[]): ClipIdea[] {
  return matches.map((m) => ({
    startMs: m.startMs,
    endMs: m.endMs,
    score: m.score,
    titleSuggestion: m.titleSuggestion,
    rationale: `${m.rationale} [sceneId=${m.sceneId}]`,
  }));
}
