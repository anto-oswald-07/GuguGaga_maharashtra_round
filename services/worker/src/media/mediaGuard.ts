/**
 * Shared media pipeline guards (Phase 10 — Dev D).
 * Clear, job-safe error strings for missing files, zero-duration, and ffmpeg failures.
 */

import { execFile } from 'node:child_process';
import { access, mkdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Stable error codes for job failure surfaces / logs. */
export type MediaErrorCode =
  | 'INPUT_MISSING'
  | 'INPUT_EMPTY'
  | 'ZERO_DURATION'
  | 'RANGE_INVALID'
  | 'RANGE_OUT_OF_BOUNDS'
  | 'FFMPEG_MISSING'
  | 'FFMPEG_FAILED'
  | 'OUTPUT_MISSING'
  | 'ASSET_UNMAPPED';

export class MediaPipelineError extends Error {
  readonly code: MediaErrorCode;
  readonly cause?: unknown;

  constructor(code: MediaErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'MediaPipelineError';
    this.code = code;
    this.cause = cause;
  }
}

export function isMediaPipelineError(err: unknown): err is MediaPipelineError {
  return err instanceof MediaPipelineError;
}

/** Truncate ffmpeg stderr for job.error (keep actionable tail). */
export function summarizeFfmpegStderr(stderr: unknown, maxLen = 400): string {
  const text = String(stderr ?? '')
    .replace(/\r/g, '')
    .trim();
  if (!text) return '(no ffmpeg stderr)';
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const tail = lines.slice(-8).join(' | ');
  return tail.length > maxLen ? `…${tail.slice(-maxLen)}` : tail;
}

function isExecErrno(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === code
  );
}

/**
 * Ensure input exists and is readable. Throws INPUT_MISSING / INPUT_EMPTY.
 */
export async function assertInputReadable(
  inputPath: string,
  kind = 'media',
): Promise<void> {
  if (!inputPath?.trim()) {
    throw new MediaPipelineError(
      'INPUT_MISSING',
      `Input ${kind} path is empty. Pass a readable file under STORAGE_ROOT or storage/samples/.`,
    );
  }
  try {
    await access(inputPath, constants.R_OK);
  } catch (err) {
    throw new MediaPipelineError(
      'INPUT_MISSING',
      `Input ${kind} missing or not readable: ${inputPath}. ` +
        `Check upload path / STORAGE_ROOT. Run ./scripts/media/make-dummy-video.sh for local smoke.`,
      err,
    );
  }
  let size = 0;
  try {
    size = (await stat(inputPath)).size;
  } catch (err) {
    throw new MediaPipelineError(
      'INPUT_MISSING',
      `Input ${kind} unstatable: ${inputPath}`,
      err,
    );
  }
  if (size <= 0) {
    throw new MediaPipelineError(
      'INPUT_EMPTY',
      `Input ${kind} is empty (0 bytes): ${inputPath}. Re-upload or regenerate the source.`,
    );
  }
}

/**
 * Probe media duration in seconds via ffprobe.
 * Returns 0 if unknown / unreadable duration (does not throw).
 */
export async function probeDurationSeconds(inputPath: string): Promise<number> {
  try {
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
  } catch (err) {
    if (isExecErrno(err, 'ENOENT')) {
      throw new MediaPipelineError(
        'FFMPEG_MISSING',
        'ffprobe not found on PATH. Install ffmpeg (sudo apt-get install -y ffmpeg) and run ./scripts/media/check-ffmpeg.sh.',
        err,
      );
    }
    return 0;
  }
}

/**
 * Require positive duration. Throws ZERO_DURATION with a clear job message.
 * @returns duration seconds
 */
export async function assertPositiveDuration(
  inputPath: string,
  opts: { minSeconds?: number; kind?: string } = {},
): Promise<number> {
  const minSeconds = opts.minSeconds ?? 0.05;
  const kind = opts.kind ?? 'media';
  const duration = await probeDurationSeconds(inputPath);
  if (!(duration > 0) || duration < minSeconds) {
    throw new MediaPipelineError(
      'ZERO_DURATION',
      `Input ${kind} has zero or unusable duration` +
        `${duration > 0 ? ` (${duration.toFixed(3)}s < ${minSeconds}s min)` : ''}: ${inputPath}. ` +
        `Re-encode the source or use ./scripts/media/make-dummy-video.sh / bake-demo-fallback.sh.`,
    );
  }
  return duration;
}

/**
 * Validate cut window against source duration (ms).
 * - Rejects zero-length and start past EOF.
 * - Clamps endMs to source EOF when it overshoots (matches prior ffmpeg `-t` behavior
 *   and Phase 7/9 demos where score windows can exceed short `dummy.mp4`).
 */
export function normalizeCutRangeMs(
  startMs: number,
  endMs: number,
  sourceDurationSec: number,
): { startMs: number; endMs: number; clamped: boolean } {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new MediaPipelineError(
      'RANGE_INVALID',
      `startMs/endMs must be finite numbers (got start=${startMs}, end=${endMs}).`,
    );
  }
  if (startMs < 0) {
    throw new MediaPipelineError(
      'RANGE_INVALID',
      `startMs must be >= 0 (got ${startMs}).`,
    );
  }
  if (endMs <= startMs) {
    throw new MediaPipelineError(
      'RANGE_INVALID',
      `Clip window has zero/negative duration (startMs=${startMs}, endMs=${endMs}). ` +
        `endMs must be > startMs.`,
    );
  }
  const sourceMs = sourceDurationSec * 1000;
  if (startMs >= sourceMs) {
    throw new MediaPipelineError(
      'RANGE_OUT_OF_BOUNDS',
      `Clip startMs=${startMs} is past source duration ${sourceMs.toFixed(0)}ms (${sourceDurationSec.toFixed(3)}s). ` +
        `Pick a window inside the source media.`,
    );
  }
  let end = endMs;
  let clamped = false;
  if (end > sourceMs + 1) {
    end = sourceMs;
    clamped = true;
  }
  if (end <= startMs) {
    throw new MediaPipelineError(
      'RANGE_OUT_OF_BOUNDS',
      `After clamping to source duration ${sourceMs.toFixed(0)}ms, clip window is empty ` +
        `(startMs=${startMs}). Source is too short for this cut.`,
    );
  }
  return { startMs, endMs: end, clamped };
}

/** @deprecated Prefer normalizeCutRangeMs — kept name for call-site clarity in docs. */
export function assertCutRangeMs(
  startMs: number,
  endMs: number,
  sourceDurationSec: number,
): void {
  normalizeCutRangeMs(startMs, endMs, sourceDurationSec);
}

/** Ensure parent dir exists before ffmpeg write. */
export async function ensureOutputDir(outputPath: string): Promise<void> {
  if (!outputPath?.trim()) {
    throw new MediaPipelineError(
      'OUTPUT_MISSING',
      'Output path is empty. Pass a writable path under storage/workspaces/.../renders/.',
    );
  }
  await mkdir(dirname(outputPath), { recursive: true });
}

/** Confirm ffmpeg wrote a non-empty output. */
export async function assertOutputWritten(
  outputPath: string,
  op = 'ffmpeg',
): Promise<void> {
  try {
    await access(outputPath, constants.R_OK);
  } catch (err) {
    throw new MediaPipelineError(
      'OUTPUT_MISSING',
      `${op} did not produce output file: ${outputPath}`,
      err,
    );
  }
  const size = (await stat(outputPath)).size;
  if (size <= 0) {
    throw new MediaPipelineError(
      'OUTPUT_MISSING',
      `${op} produced empty output (0 bytes): ${outputPath}`,
    );
  }
}

/**
 * Run ffmpeg with argv (no binary name). Wraps failures as MediaPipelineError.
 */
export async function runFfmpeg(
  args: string[],
  opts: { maxBuffer?: number; op?: string } = {},
): Promise<void> {
  const op = opts.op ?? 'ffmpeg';
  const maxBuffer = opts.maxBuffer ?? 40 * 1024 * 1024;
  try {
    await execFileAsync('ffmpeg', args, { maxBuffer });
  } catch (err) {
    if (isExecErrno(err, 'ENOENT')) {
      throw new MediaPipelineError(
        'FFMPEG_MISSING',
        'ffmpeg not found on PATH. Install ffmpeg (sudo apt-get install -y ffmpeg or brew install ffmpeg) and run ./scripts/media/check-ffmpeg.sh.',
        err,
      );
    }
    const stderr =
      typeof err === 'object' && err !== null && 'stderr' in err
        ? (err as { stderr?: unknown }).stderr
        : undefined;
    const detail = summarizeFfmpegStderr(stderr);
    throw new MediaPipelineError(
      'FFMPEG_FAILED',
      `${op} failed: ${detail}`,
      err,
    );
  }
}
