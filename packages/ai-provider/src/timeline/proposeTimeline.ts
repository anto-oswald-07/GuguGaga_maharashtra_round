/**
 * Timeline proposal (Phase 8 MVP — SDD §4.3 / §7.1).
 * Pure functions — no I/O. Used by all AiProvider implementations.
 *
 * Builds EditTimeline JSON from accepted clips (or clipIdeas) + script hook
 * text overlay at 0–3s + optional caption items from alignments.
 * Identical inputs → identical timelines (demo stability).
 */

import type {
  Alignment,
  EditTimeline,
  ScriptDoc,
  TimelineAcceptedClip,
  TimelineAudioClip,
  TimelineCaptionItem,
  TimelineContext,
  TimelineTextItem,
  TimelineVideoClip,
} from '../types';

/** Hook overlay window (plan: 0–3s). */
export const HOOK_OVERLAY_START_MS = 0;
export const HOOK_OVERLAY_END_MS = 3_000;

/** Maximum character length per caption cue to prevent frame congestion. */
export const MAX_CAPTION_CHARS_PER_FRAME = 38;

/** Placeholder asset when context has no sourceAssetId (valid UUID shape). */
export const DEMO_SOURCE_ASSET_ID = '00000000-0000-4000-8000-0000000000a1';

const DEFAULT_FPS = 30;

function clipDuration(c: { startMs: number; endMs: number }): number {
  return Math.max(0, c.endMs - c.startMs);
}

function hookText(script: ScriptDoc): string {
  const hook = (script.hook ?? '').trim();
  if (hook.length > 0) {
    // First sentence / ~50 chars for overlay readability without frame congestion
    const cut = hook.split(/(?<=[.!?])\s+/)[0] ?? hook;
    return cut.length > 55 ? `${cut.slice(0, 52).trimEnd()}…` : cut;
  }
  return (script.title ?? 'Hook').trim() || 'Hook';
}

function resolveSourceClips(ctx: TimelineContext): TimelineAcceptedClip[] {
  if (ctx.acceptedClips && ctx.acceptedClips.length > 0) {
    return ctx.acceptedClips.filter((c) => c.endMs > c.startMs);
  }
  if (ctx.clipIdeas && ctx.clipIdeas.length > 0) {
    return ctx.clipIdeas
      .filter((c) => c.endMs > c.startMs)
      .map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        titleSuggestion: c.titleSuggestion,
        label: c.titleSuggestion,
      }));
  }
  return [];
}

/** Stable demo windows when no accepted clips / ideas are provided. */
export function stableDemoAcceptedClips(
  script: ScriptDoc,
): TimelineAcceptedClip[] {
  const label = (script.title ?? 'Batch Reels').slice(0, 40);
  return [
    {
      id: 'demo-c1',
      startMs: 0,
      endMs: 15_000,
      label: `${label} — open`,
      titleSuggestion: `${label} — open`,
    },
    {
      id: 'demo-c2',
      startMs: 15_000,
      endMs: 35_000,
      label: `${label} — body`,
      titleSuggestion: `${label} — body`,
    },
    {
      id: 'demo-c3',
      startMs: 35_000,
      endMs: 50_000,
      label: `${label} — CTA`,
      titleSuggestion: `${label} — CTA`,
    },
  ];
}

function buildVideoClips(
  sources: TimelineAcceptedClip[],
  sourceAssetId: string,
): TimelineVideoClip[] {
  let cursor = 0;
  return sources.map((c, i) => {
    const dur = clipDuration(c);
    const clip: TimelineVideoClip = {
      id: c.id ?? `c${i + 1}`,
      assetId: c.assetId ?? sourceAssetId,
      srcStartMs: c.startMs,
      srcEndMs: c.endMs,
      timelineStartMs: cursor,
      label: c.label ?? c.titleSuggestion,
    };
    cursor += dur;
    return clip;
  });
}

function buildHookOverlay(script: ScriptDoc): TimelineTextItem {
  return {
    id: 'tx-hook',
    text: hookText(script),
    startMs: HOOK_OVERLAY_START_MS,
    endMs: HOOK_OVERLAY_END_MS,
    style: { position: 'bottom', fontSize: 32 },
  };
}

/**
 * Split long sentence/alignment excerpts into short, uncluttered cues
 * so frame captions never congest or overflow the display.
 */
function splitIntoReadableCues(
  text: string,
  maxLen = MAX_CAPTION_CHARS_PER_FRAME,
): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return [trimmed];
  const words = trimmed.split(/\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxLen) {
      current += ` ${word}`;
    } else {
      chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [trimmed.slice(0, maxLen)];
}

/**
 * Map high-confidence alignments onto the timeline as caption cues.
 * Restrains caption cue length to <= 45 chars per frame to avoid congestion.
 */
function buildCaptionsFromAlignments(
  alignments: Alignment[] | undefined,
  durationMs: number,
): TimelineCaptionItem[] {
  if (!alignments || alignments.length === 0) return [];
  const sorted = [...alignments]
    .filter((a) => a.endMs > a.startMs && a.confidence >= 0.4)
    .sort((a, b) => a.startMs - b.startMs || b.confidence - a.confidence);

  const out: TimelineCaptionItem[] = [];
  for (let i = 0; i < sorted.length && out.length < 16; i += 1) {
    const a = sorted[i]!;
    const startMs = Math.max(0, Math.min(a.startMs, durationMs));
    const endMs = Math.max(startMs + 200, Math.min(a.endMs, durationMs));
    if (endMs <= startMs || startMs >= durationMs) continue;
    const text = a.scriptExcerpt.trim();
    if (!text) continue;

    const chunks = splitIntoReadableCues(text, MAX_CAPTION_CHARS_PER_FRAME);
    const totalSpan = endMs - startMs;
    const stepMs = Math.floor(totalSpan / chunks.length);

    chunks.forEach((chunk, cIdx) => {
      if (out.length >= 16) return;
      const cStart = startMs + cIdx * stepMs;
      const cEnd =
        cIdx === chunks.length - 1 ? endMs : Math.min(endMs, cStart + stepMs);
      const cleaned =
        chunk.length > MAX_CAPTION_CHARS_PER_FRAME
          ? `${chunk.slice(0, MAX_CAPTION_CHARS_PER_FRAME - 3).trimEnd()}…`
          : chunk;
      out.push({
        id: `s${out.length + 1}`,
        text: cleaned,
        startMs: cStart,
        endMs: cEnd,
      });
    });
  }
  return out;
}

/**
 * Lightweight shape check matching SDD §4.3 / docs/timeline-notes.md.
 * Full Zod lives in `@creatorai/timeline-schema` (Dev D) — use that when present.
 */
export function assertValidTimelineShape(timeline: EditTimeline): void {
  if (timeline.schemaVersion !== '1.0') {
    throw new Error(`schemaVersion must be "1.0" (got ${timeline.schemaVersion})`);
  }
  if (!Number.isFinite(timeline.fps) || timeline.fps <= 0) {
    throw new Error(`fps must be > 0 (got ${timeline.fps})`);
  }
  if (!Number.isFinite(timeline.durationMs) || timeline.durationMs <= 0) {
    throw new Error(`durationMs must be > 0 (got ${timeline.durationMs})`);
  }
  if (!Array.isArray(timeline.tracks) || timeline.tracks.length === 0) {
    throw new Error('tracks must be a non-empty array');
  }
  const video = timeline.tracks.find((t) => t.type === 'video');
  if (!video || video.type !== 'video' || video.clips.length === 0) {
    throw new Error('timeline must include a video track with ≥1 clip');
  }
  for (const c of video.clips) {
    if (c.srcEndMs <= c.srcStartMs) {
      throw new Error(`video clip ${c.id}: srcEndMs must be > srcStartMs`);
    }
    if (!c.assetId) {
      throw new Error(`video clip ${c.id}: assetId required`);
    }
  }
  const text = timeline.tracks.find((t) => t.type === 'text');
  if (!text || text.type !== 'text') {
    throw new Error('timeline must include a text track (hook overlay)');
  }
  const hook = text.items.find((i) => i.id === 'tx-hook') ?? text.items[0];
  if (!hook) {
    throw new Error('text track must include hook overlay item');
  }
  if (hook.startMs !== HOOK_OVERLAY_START_MS || hook.endMs !== HOOK_OVERLAY_END_MS) {
    // Allow only exact plan window for AI proposals
    throw new Error(
      `hook overlay must be ${HOOK_OVERLAY_START_MS}–${HOOK_OVERLAY_END_MS}ms`,
    );
  }
}

export function validateTimeline(timeline: EditTimeline): void {
  try {
    // Optional peer — Cyrus Phase 8 D (`@creatorai/timeline-schema`).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@creatorai/timeline-schema') as {
      assertValidTimeline?: (t: unknown) => void;
    };
    if (typeof mod.assertValidTimeline === 'function') {
      mod.assertValidTimeline(timeline);
      return;
    }
  } catch {
    // Package not installed yet — fall through
  }
  assertValidTimelineShape(timeline);
}

/**
 * Build an EditTimeline from mappings + accepted clips + hook overlay.
 */
export function proposeTimelineFromContext(ctx: TimelineContext): EditTimeline {
  const sourceAssetId = ctx.sourceAssetId?.trim() || DEMO_SOURCE_ASSET_ID;
  const resolved = resolveSourceClips(ctx);
  const sources =
    resolved.length > 0 ? resolved : stableDemoAcceptedClips(ctx.script);

  const videoClips = buildVideoClips(sources, sourceAssetId);
  const last = videoClips[videoClips.length - 1]!;
  const durationMs =
    last.timelineStartMs + (last.srcEndMs - last.srcStartMs);

  const hookItem = buildHookOverlay(ctx.script);
  const captions = buildCaptionsFromAlignments(ctx.alignments, durationMs);

  const audioClips: TimelineAudioClip[] = [];
  if (ctx.audioClips && ctx.audioClips.length > 0) {
    audioClips.push(
      ...ctx.audioClips.map((c, i) => ({
        ...c,
        id: c.id ?? `a${i + 1}`,
      })),
    );
  } else if (ctx.assets && ctx.assets.length > 0) {
    const audioAssets = ctx.assets.filter((a) => a.type === 'AUDIO');
    if (audioAssets.length > 0) {
      audioClips.push(
        ...audioAssets.map((a, i) => ({
          id: `a${i + 1}`,
          assetId: a.id,
          srcStartMs: 0,
          srcEndMs: Math.min(
            Math.max(1000, a.durationMs ?? durationMs),
            durationMs,
          ),
          timelineStartMs: 0,
          label: a.name || 'Background Music',
        })),
      );
    }
  }

  const usedIdeas = Boolean(ctx.acceptedClips?.length || ctx.clipIdeas?.length);
  const timeline: EditTimeline = {
    schemaVersion: '1.0',
    fps: DEFAULT_FPS,
    durationMs,
    tracks: [
      {
        id: 'v1',
        type: 'video',
        clips: videoClips,
      },
      {
        id: 'a1',
        type: 'audio',
        clips: audioClips,
      },
      {
        id: 't1',
        type: 'text',
        items: [hookItem],
      },
      {
        id: 'cap1',
        type: 'captions',
        items: captions,
      },
    ],
    transitions: [],
    meta: {
      generatedBy: 'ai',
      prompt: usedIdeas
        ? 'proposeTimeline from accepted clips + alignments + hook overlay'
        : 'proposeTimeline stable demo (no clips) + hook overlay',
      notes: usedIdeas
        ? `${videoClips.length} clip(s); hook 0–3s`
        : 'demo fallback clips; hook 0–3s',
    },
  };

  assertValidTimelineShape(timeline);
  return timeline;
}

/** Fixed demo timeline for empty / smoke fixtures (same shape every call). */
export function stableDemoTimeline(script?: ScriptDoc): EditTimeline {
  const doc: ScriptDoc = script ?? {
    title: 'How I Batch-Create Reels in One Afternoon',
    hook: 'Stop filming one Reel a day. Batch a week in one afternoon.',
    body: 'Pick one topic. Film all A-roll. Edit decisions, not hunting.',
    cta: 'Comment BATCH for the checklist.',
  };
  return proposeTimelineFromContext({ script: doc });
}
