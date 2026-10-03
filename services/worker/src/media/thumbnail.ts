/**
 * Video thumbnail helper (Phase 3 — Dev D).
 * Captures a mid-duration JPEG frame via FFmpeg.
 *
 * Derivative path convention (SDD §4.4):
 *   storage/workspaces/{workspaceId}/derivatives/{assetId}/thumb.jpg
 */

import { execFile } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type GenerateThumbnailOptions = {
  /** Override seek time in seconds. Default: midpoint of media duration. */
  seekSeconds?: number;
  /** JPEG quality for `-q:v` (2–31, lower is better). Default: 2. */
  quality?: number;
};

export type GenerateThumbnailResult = {
  inputPath: string;
  outputPath: string;
  seekSeconds: number;
};

async function assertReadable(path: string): Promise<void> {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`Input video not readable: ${path}`);
  }
}

/**
 * Probe media duration in seconds via ffprobe. Returns 0 if unknown.
 */
export async function probeDurationSeconds(inputPath: string): Promise<number> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const parsed = Number.parseFloat(String(stdout).trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Generate a JPEG thumbnail from a video at mid-frame (or custom seek).
 */
export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  options: GenerateThumbnailOptions = {},
): Promise<GenerateThumbnailResult> {
  await assertReadable(inputPath);
  await mkdir(dirname(outputPath), { recursive: true });

  const duration = await probeDurationSeconds(inputPath);
  const seekSeconds =
    options.seekSeconds ??
    (duration > 0 ? Math.max(0, duration / 2) : 0);
  const quality = options.quality ?? 2;

  // Place -ss before -i for fast keyframe seek (demo-good accuracy).
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      seekSeconds.toFixed(3),
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-q:v',
      String(quality),
      '-update',
      '1',
      outputPath,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  await access(outputPath, constants.R_OK);

  return { inputPath, outputPath, seekSeconds };
}
