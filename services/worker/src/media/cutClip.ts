/**
 * FFmpeg clip cutter (Phase 7 — Dev D; hardened Phase 10).
 * Cuts a precise [startMs, endMs] window to MP4 under the renders path.
 *
 * Render path convention (SDD §4.4):
 *   storage/workspaces/{workspaceId}/renders/{jobId}/output.mp4
 *
 * Encoding choice (documented):
 * - Default `reencode`: seek after `-i`, re-encode H.264/AAC.
 *   Accurate to ~frame for demo cuts; avoids keyframe drift from `-c copy`.
 * - Optional `copy`: stream-copy (fast) but start may snap to prior keyframe —
 *   only use when speed matters more than boundary precision.
 */

import {
  assertCutRangeMs,
  assertInputReadable,
  assertOutputWritten,
  assertPositiveDuration,
  ensureOutputDir,
  runFfmpeg,
} from './mediaGuard';

/** How to cut: re-encode (accurate, default) or stream-copy (fast, may drift). */
export type CutClipMode = 'reencode' | 'copy';

export type CutClipOptions = {
  /** Cut mode. Default: `reencode` (accurate boundaries). */
  mode?: CutClipMode;
  /** libx264 preset when re-encoding. Default: `ultrafast` (demo-friendly). */
  preset?: string;
  /** CRF when re-encoding (lower = better). Default: 23. */
  crf?: number;
  /** Audio bitrate when re-encoding. Default: `128k`. */
  audioBitrate?: string;
};

export type CutClipResult = {
  inputPath: string;
  outputPath: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  mode: CutClipMode;
};

/**
 * Build the SDD render path for a cut clip job.
 */
export function renderClipPath(
  storageRoot: string,
  workspaceId: string,
  jobId: string,
): string {
  const root = storageRoot.replace(/\/+$/, '');
  return `${root}/workspaces/${workspaceId}/renders/${jobId}/output.mp4`;
}

/**
 * Cut `[startMs, endMs)` from a video into an MP4 at `outputPath`.
 */
export async function cutClip(
  inputPath: string,
  outputPath: string,
  startMs: number,
  endMs: number,
  options: CutClipOptions = {},
): Promise<CutClipResult> {
  await assertInputReadable(inputPath, 'video');
  const sourceDurationSec = await assertPositiveDuration(inputPath, {
    kind: 'video',
  });
  assertCutRangeMs(startMs, endMs, sourceDurationSec);
  await ensureOutputDir(outputPath);

  const mode: CutClipMode = options.mode ?? 'reencode';
  const durationMs = endMs - startMs;
  const startSec = (startMs / 1000).toFixed(3);
  const durationSec = (durationMs / 1000).toFixed(3);

  const args: string[] = ['-y'];

  if (mode === 'copy') {
    // Fast path: -ss before -i + stream copy. May start at prior keyframe.
    args.push(
      '-ss',
      startSec,
      '-i',
      inputPath,
      '-t',
      durationSec,
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      outputPath,
    );
  } else {
    // Accurate path: decode then re-encode; -ss after -i for precise seek.
    const preset = options.preset ?? 'ultrafast';
    const crf = options.crf ?? 23;
    const audioBitrate = options.audioBitrate ?? '128k';
    args.push(
      '-i',
      inputPath,
      '-ss',
      startSec,
      '-t',
      durationSec,
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
      '-movflags',
      '+faststart',
      outputPath,
    );
  }

  await runFfmpeg(args, {
    maxBuffer: 20 * 1024 * 1024,
    op: `cutClip(${mode})`,
  });
  await assertOutputWritten(outputPath, 'cutClip');

  return {
    inputPath,
    outputPath,
    startMs,
    endMs,
    durationMs,
    mode,
  };
}
