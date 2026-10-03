/**
 * Audio extract helper (Phase 6 — Dev D; hardened Phase 10).
 * Pulls a mono WAV/MP3 track from video for STT (Whisper) input.
 *
 * Derivative path convention (SDD §4.4):
 *   storage/workspaces/{workspaceId}/derivatives/{assetId}/audio.wav
 *   storage/workspaces/{workspaceId}/derivatives/{assetId}/audio.mp3
 *
 * Default: 16 kHz mono PCM WAV — Whisper-friendly and small for demos.
 */

import { extname } from 'node:path';
import {
  assertInputReadable,
  assertOutputWritten,
  assertPositiveDuration,
  ensureOutputDir,
  runFfmpeg,
} from './mediaGuard';

/** Supported STT-oriented container encodings. */
export type AudioExtractFormat = 'wav' | 'mp3';

export type ExtractAudioOptions = {
  /**
   * Output format. Default: inferred from `outputPath` extension, else `wav`.
   */
  format?: AudioExtractFormat;
  /**
   * Sample rate in Hz. Default: 16000 (Whisper / speech-recognition sweet spot).
   * Use 44100/48000 only if a downstream tool requires full-band audio.
   */
  sampleRateHz?: number;
  /** Channel count. Default: 1 (mono). */
  channels?: number;
  /** MP3 bitrate (e.g. `64k`). Ignored for WAV. Default: `64k`. */
  bitrate?: string;
};

export type ExtractAudioResult = {
  inputPath: string;
  outputPath: string;
  format: AudioExtractFormat;
  sampleRateHz: number;
  channels: number;
};

const DEFAULT_SAMPLE_RATE_HZ = 16_000;
const DEFAULT_CHANNELS = 1;
const DEFAULT_MP3_BITRATE = '64k';

function resolveFormat(
  outputPath: string,
  explicit?: AudioExtractFormat,
): AudioExtractFormat {
  if (explicit) return explicit;
  const ext = extname(outputPath).toLowerCase();
  if (ext === '.mp3') return 'mp3';
  if (ext === '.wav') return 'wav';
  return 'wav';
}

/**
 * Build the SDD derivative path for extracted STT audio.
 */
export function audioDerivativePath(
  storageRoot: string,
  workspaceId: string,
  assetId: string,
  format: AudioExtractFormat = 'wav',
): string {
  const root = storageRoot.replace(/\/+$/, '');
  return `${root}/workspaces/${workspaceId}/derivatives/${assetId}/audio.${format}`;
}

/**
 * Extract mono audio from a video (or audio) file for STT input.
 */
export async function extractAudio(
  inputPath: string,
  outputPath: string,
  options: ExtractAudioOptions = {},
): Promise<ExtractAudioResult> {
  await assertInputReadable(inputPath, 'media');
  await assertPositiveDuration(inputPath, { kind: 'media' });
  await ensureOutputDir(outputPath);

  const format = resolveFormat(outputPath, options.format);
  const sampleRateHz = options.sampleRateHz ?? DEFAULT_SAMPLE_RATE_HZ;
  const channels = options.channels ?? DEFAULT_CHANNELS;
  const bitrate = options.bitrate ?? DEFAULT_MP3_BITRATE;

  if (sampleRateHz <= 0 || !Number.isFinite(sampleRateHz)) {
    throw new Error(`Invalid sampleRateHz: ${sampleRateHz}`);
  }
  if (channels < 1 || channels > 2) {
    throw new Error(`channels must be 1 or 2 (got ${channels})`);
  }

  const args: string[] = [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ar',
    String(sampleRateHz),
    '-ac',
    String(channels),
  ];

  if (format === 'wav') {
    args.push('-acodec', 'pcm_s16le', outputPath);
  } else {
    args.push('-acodec', 'libmp3lame', '-b:a', bitrate, outputPath);
  }

  await runFfmpeg(args, {
    maxBuffer: 10 * 1024 * 1024,
    op: `extractAudio(${format})`,
  });
  await assertOutputWritten(outputPath, 'extractAudio');

  return { inputPath, outputPath, format, sampleRateHz, channels };
}
