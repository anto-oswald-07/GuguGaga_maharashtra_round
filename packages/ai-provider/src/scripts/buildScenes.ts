/**
 * Build production scenes from hook / body / CTA when a provider
 * does not return an explicit scenes[] array.
 */
import { randomUUID } from 'node:crypto';
import type { ScriptBeatType, ScriptScene } from '@creatorai/shared';

export type SceneScriptParts = {
  hook: string;
  body: string;
  cta: string;
  title?: string;
};

const DEFAULT_HOOK_MS = 4_000;
const DEFAULT_POINT_MS = 12_000;
const DEFAULT_CTA_MS = 5_000;

function splitBodyBeats(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const byPara = trimmed
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byPara.length >= 2) return byPara.slice(0, 6);
  const bySentence = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  if (bySentence.length >= 2) return bySentence.slice(0, 6);
  return [trimmed];
}

function estimateDurationMs(text: string, fallback: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // ~2.5 words/sec speaking pace, clamp 3–45s
  const ms = Math.round((words / 2.5) * 1000);
  return Math.min(45_000, Math.max(3_000, ms || fallback));
}

function sceneId(ordinal: number, deterministic: boolean): string {
  if (!deterministic) return randomUUID();
  return `00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
}

/**
 * Derive ordered scenes from a classic hook/body/cta script.
 * @param deterministic — stable UUIDs for mock/demo (ordinal-based).
 */
export function buildScenesFromScript(
  parts: SceneScriptParts,
  opts: { deterministic?: boolean } = {},
): ScriptScene[] {
  const deterministic = opts.deterministic === true;
  const scenes: ScriptScene[] = [];
  let ordinal = 0;

  const push = (
    title: string,
    spokenText: string,
    beatType: ScriptBeatType,
    visualBrief: string,
    fallbackMs: number,
  ) => {
    const text = spokenText.trim();
    if (!text) return;
    scenes.push({
      id: sceneId(ordinal, deterministic),
      ordinal,
      title,
      spokenText: text,
      beatType,
      targetDurationMs: estimateDurationMs(text, fallbackMs),
      visualBrief,
      fulfillment: { mode: 'EMPTY' },
    });
    ordinal += 1;
  };

  push(
    'Hook',
    parts.hook,
    'HOOK',
    'Talking-head open or bold text card — stop the scroll in the first 3s.',
    DEFAULT_HOOK_MS,
  );

  const beats = splitBodyBeats(parts.body);
  beats.forEach((beat, i) => {
    push(
      `Point ${i + 1}`,
      beat,
      'POINT',
      `A-roll or B-roll illustrating point ${i + 1}. Clear framing, one idea.`,
      DEFAULT_POINT_MS,
    );
  });

  push(
    'CTA',
    parts.cta,
    'CTA',
    'Direct to camera — ask for comment / save / follow with on-screen text.',
    DEFAULT_CTA_MS,
  );

  return scenes;
}

/** Prefer provider scenes when present; otherwise derive from hook/body/cta. */
export function ensureScriptScenes(
  parts: SceneScriptParts & { scenes?: ScriptScene[] | null },
  opts: { deterministic?: boolean } = {},
): ScriptScene[] {
  if (Array.isArray(parts.scenes) && parts.scenes.length > 0) {
    return parts.scenes.map((s, i) => ({
      ...s,
      ordinal: typeof s.ordinal === 'number' ? s.ordinal : i,
      fulfillment: s.fulfillment ?? { mode: 'EMPTY' as const },
    }));
  }
  return buildScenesFromScript(parts, opts);
}
