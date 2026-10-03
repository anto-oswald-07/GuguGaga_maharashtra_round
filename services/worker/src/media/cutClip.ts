/**
 * FFmpeg clip cutter (Phase 7 — Dev D).
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

import { execFile } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

async function assertReadable(path: string): Promise<void> {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`Input media not readable: ${path}`);
  }
}

function assertRange(startMs: number, endMs: number): void {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error(`startMs/endMs must be finite numbers (got ${startMs}, ${endMs})`);
  }
  if (startMs < 0) {
    throw new Error(`startMs must be >= 0 (got ${startMs})`);
  }
  if (endMs <= startMs) {
    throw new Error(`endMs must be > startMs (got start=${startMs}, end=${endMs})`);
  }
}

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
  await assertReadable(inputPath);
  assertRange(startMs, endMs);
  await mkdir(dirname(outputPath), { recursive: true });

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

  await execFileAsync('ffmpeg', args, { maxBuffer: 20 * 1024 * 1024 });
  await access(outputPath, constants.R_OK);

  return {
    inputPath,
    outputPath,
    startMs,
    endMs,
    durationMs,
    mode,
  };
}
