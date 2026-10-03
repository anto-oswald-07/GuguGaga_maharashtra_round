/**
 * FFmpeg timeline renderer (Phase 8 — Dev D).
 * Translates validated EditTimeline JSON → filter_complex → MP4 preview.
 *
 * Supports:
 * - Video track clips (trim + concat, contiguous order by timelineStartMs)
 * - Text track drawtext overlays (minimum required)
 * - Captions as softsubs (.srt muxed as mov_text) when present
 *
 * Render path convention (SDD §4.4):
 *   storage/workspaces/{workspaceId}/renders/{jobId}/output.mp4
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertValidTimeline,
  type CaptionItem,
  type EditTimeline,
  type TextItem,
  type VideoClip,
} from '@creatorai/timeline-schema';
import {
  MediaPipelineError,
  assertInputReadable,
  assertOutputWritten,
  assertPositiveDuration,
  ensureOutputDir,
  runFfmpeg,
} from './mediaGuard';

export type RenderTimelineOptions = {
  /** Map assetId → readable media path on disk. */
  assetPaths: Record<string, string>;
  /** Output MP4 path. */
  outputPath: string;
  /** Also burn caption cues with drawtext. Default: false (softsubs only). */
  burnCaptions?: boolean;
  /** libx264 preset. Default: ultrafast. */
  preset?: string;
  /** CRF. Default: 23. */
  crf?: number;
  /** Output width. Default: 1280. */
  width?: number;
  /** Output height. Default: 720. */
  height?: number;
  /** Audio bitrate. Default: 128k. */
  audioBitrate?: string;
};

export type RenderTimelineResult = {
  outputPath: string;
  durationMs: number;
  clipCount: number;
  textOverlayCount: number;
  captionCount: number;
  softsubsPath?: string;
  /** The ffmpeg argv used (for debugging / docs). */
  ffmpegArgs: string[];
};

export type FfmpegTimelinePlan = {
  inputs: string[];
  filterComplex: string;
  softsubsPath?: string;
  softsubsContent?: string;
  mapVideo: string;
  mapAudio: string;
  durationSec: string;
};

/**
 * Build SDD render path for a timeline preview job.
 */
export function renderTimelinePath(
  storageRoot: string,
  workspaceId: string,
  jobId: string,
): string {
  const root = storageRoot.replace(/\/+$/, '');
  return `${root}/workspaces/${workspaceId}/renders/${jobId}/output.mp4`;
}

function msToSec(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** Escape text for ffmpeg drawtext `text=` (single-quoted style). */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

function yForPosition(position: 'top' | 'center' | 'bottom' | undefined): string {
  switch (position) {
    case 'top':
      return '40';
    case 'center':
      return '(h-text_h)/2';
    case 'bottom':
    default:
      return 'h-th-40';
  }
}

function collectVideoClips(tl: EditTimeline): VideoClip[] {
  const clips: VideoClip[] = [];
  for (const track of tl.tracks) {
    if (track.type === 'video') {
      clips.push(...track.clips);
    }
  }
  return clips.slice().sort((a, b) => a.timelineStartMs - b.timelineStartMs);
}

function collectTextItems(tl: EditTimeline): TextItem[] {
  const items: TextItem[] = [];
  for (const track of tl.tracks) {
    if (track.type === 'text') {
      items.push(...track.items);
    }
  }
  return items;
}

function collectCaptions(tl: EditTimeline): CaptionItem[] {
  const items: CaptionItem[] = [];
  for (const track of tl.tracks) {
    if (track.type === 'captions') {
      items.push(...track.items);
    }
  }
  return items;
}

function formatSrtTime(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(millis, 3)}`;
}

/** Build WebVTT/SRT-compatible SRT body from caption items. */
export function captionsToSrt(items: CaptionItem[]): string {
  const sorted = items.slice().sort((a, b) => a.startMs - b.startMs);
  return sorted
    .map((item, i) => {
      const text = item.text.replace(/\r?\n/g, '\n');
      return `${i + 1}\n${formatSrtTime(item.startMs)} --> ${formatSrtTime(item.endMs)}\n${text}\n`;
    })
    .join('\n');
}

/**
 * Build ffmpeg inputs + filter_complex from a validated timeline.
 * Does not execute ffmpeg.
 */
export function buildFfmpegPlan(
  timeline: EditTimeline,
  options: Pick<
    RenderTimelineOptions,
    'assetPaths' | 'outputPath' | 'burnCaptions' | 'width' | 'height'
  >,
): FfmpegTimelinePlan {
  const clips = collectVideoClips(timeline);
  if (clips.length < 1) {
    throw new MediaPipelineError(
      'RANGE_INVALID',
      'timeline has no video clips — cannot render preview',
    );
  }
  if (!(timeline.durationMs > 0)) {
    throw new MediaPipelineError(
      'ZERO_DURATION',
      `timeline.durationMs must be > 0 (got ${timeline.durationMs})`,
    );
  }
  for (const clip of clips) {
    if (!(clip.srcEndMs > clip.srcStartMs)) {
      throw new MediaPipelineError(
        'RANGE_INVALID',
        `Video clip "${clip.id}" has zero/negative source window ` +
          `(srcStartMs=${clip.srcStartMs}, srcEndMs=${clip.srcEndMs})`,
      );
    }
  }

  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const inputs: string[] = [];
  const inputIndexByPath = new Map<string, number>();

  function inputIndexFor(assetId: string): number {
    const path = options.assetPaths[assetId];
    if (!path) {
      throw new MediaPipelineError(
        'ASSET_UNMAPPED',
        `No media path mapped for assetId "${assetId}" (pass assetPaths). ` +
          `Job cannot resolve originals/renders for this timeline clip.`,
      );
    }
    const existing = inputIndexByPath.get(path);
    if (existing != null) return existing;
    const idx = inputs.length;
    inputs.push(path);
    inputIndexByPath.set(path, idx);
    return idx;
  }

  const filterParts: string[] = [];
  const concatLabels: string[] = [];

  clips.forEach((clip, i) => {
    const inIdx = inputIndexFor(clip.assetId);
    const start = msToSec(clip.srcStartMs);
    const end = msToSec(clip.srcEndMs);
    const vLabel = `v${i}`;
    const aLabel = `a${i}`;
    filterParts.push(
      `[${inIdx}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,` +
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[${vLabel}]`,
    );
    // Audio may be missing on some demos — anullsrc fallback via optional stream.
    // Prefer atrim; if no audio, ffmpeg fails — callers should use media with audio
    // (dummy.mp4 has audio). Documented in timeline-notes.
    filterParts.push(
      `[${inIdx}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[${aLabel}]`,
    );
    concatLabels.push(`[${vLabel}][${aLabel}]`);
  });

  filterParts.push(
    `${concatLabels.join('')}concat=n=${clips.length}:v=1:a=1[vcat][acat]`,
  );

  let videoLabel = 'vcat';
  const textItems = collectTextItems(timeline);
  const captionItems = collectCaptions(timeline);
  const burnCaptions = options.burnCaptions === true;

  const overlays: Array<{ text: string; startMs: number; endMs: number; fontSize: number; position?: 'top' | 'center' | 'bottom'; fontColor?: string }> = [
    ...textItems.map((t) => ({
      text: t.text,
      startMs: t.startMs,
      endMs: t.endMs,
      fontSize: t.style?.fontSize ?? 48,
      position: t.style?.position,
      fontColor: t.style?.fontColor ?? 'white',
    })),
  ];

  if (burnCaptions) {
    for (const c of captionItems) {
      overlays.push({
        text: c.text,
        startMs: c.startMs,
        endMs: c.endMs,
        fontSize: 36,
        position: 'bottom',
        fontColor: 'yellow',
      });
    }
  }

  overlays.forEach((ov, i) => {
    const inLabel = videoLabel;
    const outLabel = i === overlays.length - 1 ? 'vout' : `vtx${i}`;
    const enable = `between(t\\,${msToSec(ov.startMs)}\\,${msToSec(ov.endMs)})`;
    const escaped = escapeDrawtext(ov.text);
    filterParts.push(
      `[${inLabel}]drawtext=text='${escaped}':fontsize=${ov.fontSize}:` +
        `fontcolor=${ov.fontColor ?? 'white'}:borderw=2:bordercolor=black:` +
        `x=(w-text_w)/2:y=${yForPosition(ov.position)}:enable='${enable}'[${outLabel}]`,
    );
    videoLabel = outLabel;
  });

  if (overlays.length === 0) {
    filterParts.push(`[vcat]null[vout]`);
    videoLabel = 'vout';
  }

  let softsubsPath: string | undefined;
  let softsubsContent: string | undefined;
  if (captionItems.length > 0) {
    softsubsPath = options.outputPath.replace(/\.mp4$/i, '') + '.srt';
    softsubsContent = captionsToSrt(captionItems);
  }

  return {
    inputs,
    filterComplex: filterParts.join(';'),
    softsubsPath,
    softsubsContent,
    mapVideo: '[vout]',
    mapAudio: '[acat]',
    durationSec: msToSec(timeline.durationMs),
  };
}

/**
 * Validate timeline, resolve assets, run ffmpeg → MP4 (+ optional .srt softsubs).
 */
export async function renderTimeline(
  timelineInput: unknown,
  options: RenderTimelineOptions,
): Promise<RenderTimelineResult> {
  const timeline = assertValidTimeline(timelineInput);
  const clips = collectVideoClips(timeline);
  const textItems = collectTextItems(timeline);
  const captionItems = collectCaptions(timeline);

  for (const clip of clips) {
    const path = options.assetPaths[clip.assetId];
    if (!path) {
      throw new MediaPipelineError(
        'ASSET_UNMAPPED',
        `No media path mapped for assetId "${clip.assetId}"`,
      );
    }
    await assertInputReadable(path, `asset ${clip.assetId}`);
    await assertPositiveDuration(path, { kind: `asset ${clip.assetId}` });
  }

  await ensureOutputDir(options.outputPath);

  const plan = buildFfmpegPlan(timeline, options);

  if (plan.softsubsPath && plan.softsubsContent != null) {
    await writeFile(plan.softsubsPath, plan.softsubsContent, 'utf8');
  }

  const preset = options.preset ?? 'ultrafast';
  const crf = options.crf ?? 23;
  const audioBitrate = options.audioBitrate ?? '128k';

  const args: string[] = ['-y'];
  for (const input of plan.inputs) {
    args.push('-i', input);
  }

  // Softsubs as extra input for mov_text mux (optional).
  let softsubsInputIndex: number | undefined;
  if (plan.softsubsPath) {
    softsubsInputIndex = plan.inputs.length;
    args.push('-i', plan.softsubsPath);
  }

  args.push('-filter_complex', plan.filterComplex);
  args.push('-map', plan.mapVideo, '-map', plan.mapAudio);

  if (softsubsInputIndex != null) {
    args.push('-map', `${softsubsInputIndex}:0`);
  }

  args.push(
    '-c:v',
    'libx264',
    '-preset',
    preset,
    '-crf',
    String(crf),
    '-c:a',
    'aac',
    '-b:a',
    audioBitrate,
    '-t',
    plan.durationSec,
    '-movflags',
    '+faststart',
  );

  if (softsubsInputIndex != null) {
    args.push('-c:s', 'mov_text');
  }

  args.push(options.outputPath);

  await runFfmpeg(args, {
    maxBuffer: 40 * 1024 * 1024,
    op: 'renderTimeline',
  });
  await assertOutputWritten(options.outputPath, 'renderTimeline');

  return {
    outputPath: options.outputPath,
    durationMs: timeline.durationMs,
    clipCount: clips.length,
    textOverlayCount: textItems.length,
    captionCount: captionItems.length,
    softsubsPath: plan.softsubsPath,
    ffmpegArgs: args,
  };
}

/** Convenience: resolve a single-asset smoke map. */
export function singleAssetPaths(
  assetId: string,
  mediaPath: string,
): Record<string, string> {
  return { [assetId]: mediaPath };
}

/** Join captions dir helper (SDD captions/{assetId}/). */
export function captionsDerivativePath(
  storageRoot: string,
  workspaceId: string,
  assetId: string,
  filename = 'captions.srt',
): string {
  const root = storageRoot.replace(/\/+$/, '');
  return join(
    root,
    'workspaces',
    workspaceId,
    'captions',
    assetId,
    filename,
  );
}
