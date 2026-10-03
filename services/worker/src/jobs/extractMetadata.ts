import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import type { ExtractedAssetMetadata, VideoAssetMetadata } from '@creatorai/shared';

/** Deterministic mock used when ffprobe is missing or fails (demo-safe). */
export const MOCK_VIDEO_METADATA: VideoAssetMetadata = {
  durationMs: 5000,
  width: 1280,
  height: 720,
  codec: 'mock-h264',
};

type FfprobeJson = {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    duration?: string;
  }>;
};

function runFfprobe(filePath: string): Promise<FfprobeJson> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];
    const child = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}: ${stderr.trim() || 'no stderr'}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as FfprobeJson);
      } catch (err) {
        reject(err);
      }
    });
  });
}

function secondsToMs(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

function parseFfprobe(json: FfprobeJson): VideoAssetMetadata {
  const video = json.streams?.find((s) => s.codec_type === 'video');
  const durationMs =
    secondsToMs(json.format?.duration) ??
    secondsToMs(video?.duration) ??
    MOCK_VIDEO_METADATA.durationMs;

  return {
    durationMs,
    width: video?.width ?? MOCK_VIDEO_METADATA.width,
    height: video?.height ?? MOCK_VIDEO_METADATA.height,
    codec: video?.codec_name ?? 'unknown',
  };
}

/**
 * Extract video metadata for an asset file.
 * Tries ffprobe; on any failure (missing binary, unreadable path, parse error)
 * returns mock metadata so demos/jobs never hard-crash.
 */
export async function extractMetadata(
  filePath: string,
): Promise<ExtractedAssetMetadata> {
  try {
    await access(filePath, fsConstants.R_OK);
    const probed = await runFfprobe(filePath);
    return { ...parseFfprobe(probed), source: 'ffprobe' };
  } catch {
    return { ...MOCK_VIDEO_METADATA, source: 'mock' };
  }
}

/** CLI smoke: `pnpm --filter worker extract-meta -- ../../storage/samples/dummy.mp4` */
async function main(): Promise<void> {
  const filePath = process.argv.slice(2).find((arg) => arg !== '--');
  if (!filePath) {
    console.error('Usage: tsx src/jobs/extractMetadata.ts <filePath>');
    process.exit(1);
  }
  const result = await extractMetadata(filePath);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
