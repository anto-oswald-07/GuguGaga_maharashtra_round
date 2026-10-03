/**
 * Video asset metadata extracted via ffprobe (or mock fallback).
 * Phase 3 — Dev C (Arvin). Used by worker `extractMetadata` and future Asset.metadata JSON.
 */
export type VideoAssetMetadata = {
  /** Duration in milliseconds. */
  durationMs: number;
  /** Frame width in pixels. */
  width: number;
  /** Frame height in pixels. */
  height: number;
  /** Primary video codec name (e.g. `h264`, `mock-h264`). */
  codec: string;
};

/**
 * Result of metadata extraction, including whether ffprobe or mock was used.
 */
export type ExtractedAssetMetadata = VideoAssetMetadata & {
  /** `ffprobe` when probe succeeded; `mock` when probe missing/failed. */
  source: 'ffprobe' | 'mock';
};
