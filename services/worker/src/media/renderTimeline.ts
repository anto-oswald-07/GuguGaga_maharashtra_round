/**
 * FFmpeg timeline renderer (Phase 8 — Dev D).
 * Translates validated EditTimeline JSON → filter_complex → MP4 preview.
 *
 * Supports:
 * - Video track clips (trim + concat, contiguous order by timelineStartMs)
 * - Image stills on the video track (`mediaKind: "image"`) held for
 *   (srcEndMs - srcStartMs)
 * - Audio track clips mixed in parallel (adelay + amix by timelineStartMs)
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
  type AudioClip,
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
  normalizeCutRangeMs,
  runFfmpeg,
} from './mediaGuard';

const MIX_SAMPLE_RATE = 44100;

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

function isImageClip(clip: VideoClip): boolean {
  return clip.mediaKind === 'image';
}

function clipHoldMs(clip: { srcStartMs: number; srcEndMs: number }): number {
  return Math.max(0, clip.srcEndMs - clip.srcStartMs);
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

function collectAudioClips(tl: EditTimeline): AudioClip[] {
  const clips: AudioClip[] = [];
  for (const track of tl.tracks) {
    if (track.type === 'audio') {
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

function aformatStereo(): string {
  return `aformat=sample_fmts=fltp:sample_rates=${MIX_SAMPLE_RATE}:channel_layouts=stereo`;
}

/**
 * Clamp each timed media clip's [srcStartMs, srcEndMs] to the probed source
 * duration. Image stills are skipped (hold window is authored, not source trim).
 * Matches cutClip / prior ffmpeg trim behavior so mock SCORE windows that
 * overshoot short demo media (e.g. 5s dummy.mp4) still render.
 */
export function clampTimelineToSourceDurations(
  timeline: EditTimeline,
  durationSecByAssetId: Map<string, number>,
): EditTimeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => {
      if (track.type === 'video') {
        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (isImageClip(clip)) return clip;
            const dur = durationSecByAssetId.get(clip.assetId);
            if (dur == null) return clip;
            const range = normalizeCutRangeMs(
              clip.srcStartMs,
              clip.srcEndMs,
              dur,
            );
            if (
              range.startMs === clip.srcStartMs &&
              range.endMs === clip.srcEndMs
            ) {
              return clip;
            }
            return {
              ...clip,
              srcStartMs: range.startMs,
              srcEndMs: range.endMs,
            };
          }),
        };
      }
      if (track.type === 'audio') {
        return {
          ...track,
          clips: track.clips.map((clip) => {
            const dur = durationSecByAssetId.get(clip.assetId);
            if (dur == null) return clip;
            const range = normalizeCutRangeMs(
              clip.srcStartMs,
              clip.srcEndMs,
              dur,
            );
            if (
              range.startMs === clip.srcStartMs &&
              range.endMs === clip.srcEndMs
            ) {
              return clip;
            }
            return {
              ...clip,
              srcStartMs: range.startMs,
              srcEndMs: range.endMs,
            };
          }),
        };
      }
      return track;
    }),
  };
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
      'timeline has no video/image clips — cannot render preview',
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

  const audioClips = collectAudioClips(timeline);
  for (const clip of audioClips) {
    if (!(clip.srcEndMs > clip.srcStartMs)) {
      throw new MediaPipelineError(
        'RANGE_INVALID',
        `Audio clip "${clip.id}" has zero/negative source window ` +
          `(srcStartMs=${clip.srcStartMs}, srcEndMs=${clip.srcEndMs})`,
      );
    }
  }

  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const fps = timeline.fps > 0 ? timeline.fps : 30;
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
  const scalePad =
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;

  clips.forEach((clip, i) => {
    const inIdx = inputIndexFor(clip.assetId);
    const vLabel = `v${i}`;
    const aLabel = `a${i}`;

    if (isImageClip(clip)) {
      const holdSec = msToSec(clipHoldMs(clip));
      // Still image → loop one frame for the authored hold duration.
      filterParts.push(
        `[${inIdx}:v]loop=loop=-1:size=1:start=0,trim=duration=${holdSec},` +
          `setpts=PTS-STARTPTS,fps=${fps},${scalePad}[${vLabel}]`,
      );
      filterParts.push(
        `anullsrc=channel_layout=stereo:sample_rate=${MIX_SAMPLE_RATE},` +
          `atrim=duration=${holdSec},asetpts=PTS-STARTPTS,${aformatStereo()}[${aLabel}]`,
      );
    } else {
      const start = msToSec(clip.srcStartMs);
      const end = msToSec(clip.srcEndMs);
      filterParts.push(
        `[${inIdx}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,` +
          `${scalePad}[${vLabel}]`,
      );
      // Prefer source audio; normalize for concat/amix with stills + aux tracks.
      filterParts.push(
        `[${inIdx}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,` +
          `${aformatStereo()}[${aLabel}]`,
      );
    }
    concatLabels.push(`[${vLabel}][${aLabel}]`);
  });

  filterParts.push(
    `${concatLabels.join('')}concat=n=${clips.length}:v=1:a=1[vcat][acat]`,
  );

  let videoLabel = 'vcat';
  const textItems = collectTextItems(timeline);
  const captionItems = collectCaptions(timeline);
  const burnCaptions = options.burnCaptions === true;

  const overlays: Array<{
    text: string;
    startMs: number;
    endMs: number;
    fontSize: number;
    position?: 'top' | 'center' | 'bottom';
    fontColor?: string;
  }> = [
    ...textItems.map((t) => {
      const reqSize = t.style?.fontSize ?? 32;
      const restrainedSize = Math.max(
        16,
        Math.min(reqSize, Math.floor(width / 32), 34),
      );
      const restrainedText =
        t.text.length > 55 ? `${t.text.slice(0, 52).trimEnd()}…` : t.text;
      return {
        text: restrainedText,
        startMs: t.startMs,
        endMs: t.endMs,
        fontSize: restrainedSize,
        position: t.style?.position,
        fontColor: t.style?.fontColor ?? 'white',
      };
    }),
  ];

  if (burnCaptions) {
    for (const c of captionItems) {
      // Restrain caption size based on frame width so it never overflows or congests
      const maxLen = width <= 720 ? 32 : 40;
      const capFontSize = Math.max(14, Math.min(22, Math.floor(width / 42)));
      const restrainedText =
        c.text.length > maxLen ? `${c.text.slice(0, maxLen - 3).trimEnd()}…` : c.text;
      overlays.push({
        text: restrainedText,
        startMs: c.startMs,
        endMs: c.endMs,
        fontSize: capFontSize,
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
        `fontcolor=${ov.fontColor ?? 'white'}:box=1:boxcolor=black@0.6:boxborderw=6:borderw=1:bordercolor=black:` +
        `x=(w-text_w)/2:y=${yForPosition(ov.position)}:enable='${enable}'[${outLabel}]`,
    );
    videoLabel = outLabel;
  });

  if (overlays.length === 0) {
    filterParts.push(`[vcat]null[vout]`);
    videoLabel = 'vout';
  }

  let mapAudio = '[acat]';
  if (audioClips.length > 0) {
    const mixLabels = ['[acat]'];
    audioClips.forEach((clip, i) => {
      const inIdx = inputIndexFor(clip.assetId);
      const start = msToSec(clip.srcStartMs);
      const end = msToSec(clip.srcEndMs);
      const delayMs = Math.max(0, Math.floor(clip.timelineStartMs));
      const label = `aux${i}`;
      filterParts.push(
        `[${inIdx}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,` +
          `adelay=${delayMs}|${delayMs},${aformatStereo()}[${label}]`,
      );
      mixLabels.push(`[${label}]`);
    });
    filterParts.push(
      `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:` +
        `dropout_transition=0:normalize=0[amixed]`,
    );
    mapAudio = '[amixed]';
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
    mapAudio,
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
  const audioClips = collectAudioClips(timeline);
  const textItems = collectTextItems(timeline);
  const captionItems = collectCaptions(timeline);

  const durationSecByAssetId = new Map<string, number>();

  for (const clip of clips) {
    const path = options.assetPaths[clip.assetId];
    if (!path) {
      throw new MediaPipelineError(
        'ASSET_UNMAPPED',
        `No media path mapped for assetId "${clip.assetId}"`,
      );
    }
    await assertInputReadable(path, `asset ${clip.assetId}`);
    if (isImageClip(clip)) {
      // Stills have no usable media duration — hold window is authored.
      continue;
    }
    const durationSec = await assertPositiveDuration(path, {
      kind: `asset ${clip.assetId}`,
    });
    durationSecByAssetId.set(clip.assetId, durationSec);
  }

  for (const clip of audioClips) {
    const path = options.assetPaths[clip.assetId];
    if (!path) {
      throw new MediaPipelineError(
        'ASSET_UNMAPPED',
        `No media path mapped for audio assetId "${clip.assetId}"`,
      );
    }
    await assertInputReadable(path, `audio asset ${clip.assetId}`);
    if (!durationSecByAssetId.has(clip.assetId)) {
      const durationSec = await assertPositiveDuration(path, {
        kind: `audio asset ${clip.assetId}`,
      });
      durationSecByAssetId.set(clip.assetId, durationSec);
    }
  }

  // Clamp overshooting SCORE/mock windows to source EOF (hard-fail only when
  // start is past EOF or the window collapses). Image stills are left as-is.
  const clampedTimeline = clampTimelineToSourceDurations(
    timeline,
    durationSecByAssetId,
  );

  await ensureOutputDir(options.outputPath);

  const plan = buildFfmpegPlan(clampedTimeline, options);

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
