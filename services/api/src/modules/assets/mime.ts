import type { AssetType } from '@creatorai/shared';

/** Basic MIME allowlist for Phase 3 uploads. */
export const MIME_ALLOWLIST: Readonly<Record<string, AssetType>> = {
  // video
  'video/mp4': 'VIDEO',
  'video/webm': 'VIDEO',
  'video/quicktime': 'VIDEO',
  'video/x-msvideo': 'VIDEO',
  // image
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/webp': 'IMAGE',
  'image/gif': 'IMAGE',
  // audio
  'audio/mpeg': 'AUDIO',
  'audio/mp3': 'AUDIO',
  'audio/wav': 'AUDIO',
  'audio/x-wav': 'AUDIO',
  'audio/ogg': 'AUDIO',
  'audio/webm': 'AUDIO',
  'audio/mp4': 'AUDIO',
  // documents
  'text/plain': 'DOCUMENT',
  'text/markdown': 'DOCUMENT',
  'text/csv': 'DOCUMENT',
  'application/pdf': 'DOCUMENT',
  'application/json': 'DOCUMENT',
  'application/msword': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'DOCUMENT',
};

export function assetTypeFromMime(mime: string): AssetType | null {
  const key = mime.toLowerCase().split(';')[0]!.trim();
  return MIME_ALLOWLIST[key] ?? null;
}

export function isAllowedMime(mime: string): boolean {
  return assetTypeFromMime(mime) !== null;
}
