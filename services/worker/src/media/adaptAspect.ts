/**
 * Aspect ratio adaptation (Phase 9 — Dev D).
 * Converts a source preview/clip to 16:9, 9:16, or 1:1 via center crop (default)
 * or letterbox/pillarbox pad.
 *
 * Output convention (matches Anto packs API):
 *   storage/workspaces/{workspaceId}/renders/{jobId}/pack-{platform}.mp4
 *
 * Face-aware reframe is intentionally skipped (FR-PLT-004 P1).
 */

import { execFile } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Platform pack aspect ratios (`@creatorai/shared` packs.ts). */
export type AspectRatio = 'R_16_9' | 'R_9_16' | 'R_1_1';

/** How to fit source into target: fill+center-crop (default) or fit+pad. */
export type AdaptFitMode = 'crop' | 'pad';

export const ASPECT_RATIOS: readonly AspectRatio[] = [
  'R_16_9',
  'R_9_16',
  'R_1_1',
] as const;

/** Demo-friendly target resolutions (FR-PLT-001). */
export const ASPECT_DIMENSIONS: Record<
  AspectRatio,
  { width: number; height: number; label: string }
> = {
  R_16_9: { width: 1280, height: 720, label: '16:9' },
  R_9_16: { width: 720, height: 1280, label: '9:16' },
  R_1_1: { width: 1080, height: 1080, label: '1:1' },
};

export type AdaptAspectOptions = {
  aspectRatio: AspectRatio;
  /** Default `crop` (center fill). Use `pad` for letterbox/pillarbox. */
  fit?: AdaptFitMode;
  /** libx264 preset. Default: ultrafast. */
  preset?: string;
  /** CRF. Default: 23. */
  crf?: number;
  /** Audio bitrate. Default: 128k. */
  audioBitrate?: string;
};

export type AdaptAspectResult = {
  inputPath: string;
  outputPath: string;
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  fit: AdaptFitMode;
  label: string;
};

async function assertReadable(path: string): Promise<void> {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`Input media not readable: ${path}`);
  }
}

export function isAspectRatio(value: string): value is AspectRatio {
  return (ASPECT_RATIOS as readonly string[]).includes(value);
}

/**
 * Build Anto-compatible pack render path.
 * `storage/workspaces/{workspaceId}/renders/{jobId}/pack-{platform}.mp4`
 */
export function adaptPackOutputPath(
  storageRoot: string,
  workspaceId: string,
  jobId: string,
  platform: string,
): string {
  const root = storageRoot.replace(/\/+$/, '');
  return join(
    root,
    'workspaces',
    workspaceId,
    'renders',
    jobId,
    `pack-${platform.toLowerCase()}.mp4`,
  );
}

/**
 * Sample / smoke path helper (not the production pack path).
 * `storage/.../renders/{jobId}/adapt-{aspect}.mp4`
 */
export function adaptAspectOutputPath(
  storageRoot: string,
  workspaceId: string,
  jobId: string,
  aspectRatio: AspectRatio,
): string {
  const root = storageRoot.replace(/\/+$/, '');
  const slug = aspectRatio.toLowerCase().replace(/_/g, '-');
  return join(
    root,
    'workspaces',
    workspaceId,
    'renders',
    jobId,
    `adapt-${slug}.mp4`,
  );
}

/** vf string for center crop (fill) or pad (fit). */
export function buildAdaptFilter(
  aspectRatio: AspectRatio,
  fit: AdaptFitMode = 'crop',
): { filter: string; width: number; height: number; label: string } {
  const dim = ASPECT_DIMENSIONS[aspectRatio];
  const { width, height, label } = dim;
  if (fit === 'pad') {
    return {
      width,
      height,
      label,
      filter:
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
    };
  }
  // Center crop (fill frame — MVP default).
  return {
    width,
    height,
    label,
    filter:
      `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setsar=1`,
  };
}

/**
 * Adapt `inputPath` to the target aspect ratio → MP4 at `outputPath`.
 *
 * Signature expected by Integration (Anto jobs ADAPT_PLATFORM):
 *   adaptAspect(source, out, { aspectRatio })
 */
export async function adaptAspect(
  inputPath: string,
  outputPath: string,
  options: AdaptAspectOptions,
): Promise<AdaptAspectResult> {
  if (!options?.aspectRatio || !isAspectRatio(options.aspectRatio)) {
    throw new Error(
      `aspectRatio must be one of ${ASPECT_RATIOS.join(', ')} (got ${options?.aspectRatio})`,
    );
  }

  await assertReadable(inputPath);
  await mkdir(dirname(outputPath), { recursive: true });

  const fit: AdaptFitMode = options.fit ?? 'crop';
  const { filter, width, height, label } = buildAdaptFilter(
    options.aspectRatio,
    fit,
  );
  const preset = options.preset ?? 'ultrafast';
  const crf = options.crf ?? 23;
  const audioBitrate = options.audioBitrate ?? '128k';

  const args = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    filter,
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
  ];

  await execFileAsync('ffmpeg', args, { maxBuffer: 40 * 1024 * 1024 });
  await access(outputPath, constants.R_OK);

  return {
    inputPath,
    outputPath,
    aspectRatio: options.aspectRatio,
    width,
    height,
    fit,
    label,
  };
}

/**
 * Adapt one source into every MVP aspect (smoke / batch helper).
 */
export async function adaptAspectAll(
  inputPath: string,
  outputDir: string,
  options: Omit<AdaptAspectOptions, 'aspectRatio'> = {},
): Promise<AdaptAspectResult[]> {
  const results: AdaptAspectResult[] = [];
  for (const aspectRatio of ASPECT_RATIOS) {
    const slug = aspectRatio.toLowerCase().replace(/_/g, '-');
    const outputPath = join(outputDir, `adapt-${slug}.mp4`);
    results.push(
      await adaptAspect(inputPath, outputPath, { ...options, aspectRatio }),
    );
  }
  return results;
}
