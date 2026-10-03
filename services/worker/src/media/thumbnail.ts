/**
 * Video thumbnail helper (Phase 3 — Dev D; hardened Phase 10).
 * Captures a mid-duration JPEG frame via FFmpeg.
 *
 * Derivative path convention (SDD §4.4):
 *   storage/workspaces/{workspaceId}/derivatives/{assetId}/thumb.jpg
 */

import {
  assertInputReadable,
  assertOutputWritten,
  assertPositiveDuration,
  ensureOutputDir,
  probeDurationSeconds,
  runFfmpeg,
} from './mediaGuard';

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

/** Re-export for callers that probed via thumbnail module historically. */
export { probeDurationSeconds };

/**
 * Generate a JPEG thumbnail from a video at mid-frame (or custom seek).
 */
export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  options: GenerateThumbnailOptions = {},
): Promise<GenerateThumbnailResult> {
  await assertInputReadable(inputPath, 'video');
  const duration = await assertPositiveDuration(inputPath, { kind: 'video' });
  await ensureOutputDir(outputPath);

  const seekSeconds =
    options.seekSeconds ?? Math.max(0, duration / 2);
  if (seekSeconds >= duration) {
    throw new Error(
      `seekSeconds=${seekSeconds} is past video duration ${duration.toFixed(3)}s for ${inputPath}`,
    );
  }
  const quality = options.quality ?? 2;

  // Place -ss before -i for fast keyframe seek (demo-good accuracy).
  await runFfmpeg(
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
    { maxBuffer: 10 * 1024 * 1024, op: 'generateThumbnail' },
  );

  await assertOutputWritten(outputPath, 'generateThumbnail');

  return { inputPath, outputPath, seekSeconds };
}
