import fs from 'node:fs/promises';
import path from 'node:path';
import { extractMetadata } from 'worker/jobs/extractMetadata';
import { generateThumbnail } from 'worker/media/thumbnail';
import { storage } from '../../storage/local';

/**
 * Minimal valid 1×1 JPEG used when ffmpeg is unavailable (demo placeholder).
 * Base64 of a tiny gray pixel JPEG.
 */
const PLACEHOLDER_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z',
  'base64',
);

export type EnrichedVideoMetadata = {
  durationMs: number;
  width: number;
  height: number;
  codec: string;
  metaSource: 'ffprobe' | 'mock';
  thumbnailPath: string | null;
  thumbnailSource: 'ffmpeg' | 'placeholder' | 'none';
};

/**
 * Phase 3 Integration MVP: sync enrichment after video upload.
 * Prefer async Job queue later; this keeps demos working without a Job table.
 */
export async function enrichVideoAsset(opts: {
  workspaceId: string;
  assetId: string;
  originalRelativePath: string;
}): Promise<EnrichedVideoMetadata> {
  const absoluteOriginal = storage.absoluteFromRelative(opts.originalRelativePath);
  const extracted = await extractMetadata(absoluteOriginal);

  const thumbRelative = path.posix.join(
    'workspaces',
    opts.workspaceId,
    'derivatives',
    opts.assetId,
    'thumb.jpg',
  );
  const thumbAbsolute = storage.absoluteFromRelative(thumbRelative);

  let thumbnailPath: string | null = null;
  let thumbnailSource: EnrichedVideoMetadata['thumbnailSource'] = 'none';

  try {
    await generateThumbnail(absoluteOriginal, thumbAbsolute);
    thumbnailPath = thumbRelative;
    thumbnailSource = 'ffmpeg';
  } catch {
    try {
      await fs.mkdir(path.dirname(thumbAbsolute), { recursive: true });
      await fs.writeFile(thumbAbsolute, PLACEHOLDER_JPEG);
      thumbnailPath = thumbRelative;
      thumbnailSource = 'placeholder';
    } catch {
      thumbnailPath = null;
      thumbnailSource = 'none';
    }
  }

  return {
    durationMs: extracted.durationMs,
    width: extracted.width,
    height: extracted.height,
    codec: extracted.codec,
    metaSource: extracted.source,
    thumbnailPath,
    thumbnailSource,
  };
}
