/**
 * Platform packaging copy limits (Phase 9 — Dev C).
 * Source of truth for docs: `docs/ai/platform-copy-guidelines.md`.
 */
import type { Platform } from '@creatorai/shared';

export type PlatformCopyLimits = {
  /** Preferred max length for a title / first-line hook. */
  titleMax: number;
  /** Preferred max length for the primary caption / on-post text. */
  captionMax: number;
  /** Soft max hashtag count (excluding brand staples). */
  hashtagMax: number;
  /** Longer description (YouTube / LinkedIn); 0 = unused for shorts-first platforms. */
  descriptionMax: number;
  /** Demo label prefix so packs are visually distinct in UI. */
  demoLabel: string;
  /** Default aspect for this platform (Cyrus adaptAspect / packs UI). */
  aspect: '16:9' | '9:16' | '1:1';
};

/** Soft limits used by mock + clamp helpers (MVP — not hard API rejects). */
export const PLATFORM_COPY_LIMITS: Record<Platform, PlatformCopyLimits> = {
  YOUTUBE: {
    titleMax: 70,
    captionMax: 200,
    hashtagMax: 8,
    descriptionMax: 2000,
    demoLabel: '[YT]',
    aspect: '16:9',
  },
  YOUTUBE_SHORTS: {
    titleMax: 70,
    captionMax: 100,
    hashtagMax: 5,
    descriptionMax: 500,
    demoLabel: '[Shorts]',
    aspect: '9:16',
  },
  INSTAGRAM_REELS: {
    titleMax: 40,
    captionMax: 300,
    hashtagMax: 12,
    descriptionMax: 0,
    demoLabel: '[Reels]',
    aspect: '9:16',
  },
  TIKTOK: {
    titleMax: 40,
    captionMax: 150,
    hashtagMax: 5,
    descriptionMax: 0,
    demoLabel: '[TikTok]',
    aspect: '9:16',
  },
  LINKEDIN: {
    titleMax: 100,
    captionMax: 600,
    hashtagMax: 5,
    descriptionMax: 1500,
    demoLabel: '[LinkedIn]',
    aspect: '1:1',
  },
};

export function limitsForPlatform(platform: Platform | string): PlatformCopyLimits {
  const key = String(platform).toUpperCase() as Platform;
  return PLATFORM_COPY_LIMITS[key] ?? PLATFORM_COPY_LIMITS.YOUTUBE_SHORTS;
}

/** Truncate on a word boundary when possible; always ≤ max. */
export function clampCopy(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (max <= 0 || t.length <= max) return t;
  if (max <= 1) return t.slice(0, max);
  const sliced = t.slice(0, max - 1);
  const sp = sliced.lastIndexOf(' ');
  const base = sp > Math.floor(max * 0.5) ? sliced.slice(0, sp) : sliced;
  return `${base.trimEnd()}…`;
}

/** Normalize hashtags to `#tag` form without spaces. */
export function normalizeHashtag(tag: string): string {
  const raw = tag.trim().replace(/^#+/, '').replace(/\s+/g, '');
  if (!raw) return '';
  return `#${raw}`;
}
