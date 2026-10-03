/**
 * Platform pack enums for Phase 9 UI.
 * TODO_SHARED: prefer `@creatorai/shared` once Anto lands pack Zod DTOs.
 * AspectRatio mirrors SDD §4.2; PackStatus mirrors FR-PLT-006.
 */

import {
  PLATFORMS,
  PLATFORM_LABELS,
  type Platform,
} from "@/components/projects/constants";

export { PLATFORMS, PLATFORM_LABELS, type Platform };

export const ASPECT_RATIOS = ["R_16_9", "R_9_16", "R_1_1"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  R_16_9: "16:9",
  R_9_16: "9:16",
  R_1_1: "1:1",
};

/** Default aspect per platform for generate UX (API may override). */
export const DEFAULT_ASPECT_BY_PLATFORM: Record<Platform, AspectRatio> = {
  YOUTUBE: "R_16_9",
  YOUTUBE_SHORTS: "R_9_16",
  INSTAGRAM_REELS: "R_9_16",
  TIKTOK: "R_9_16",
  LINKEDIN: "R_1_1",
};

export const PACK_STATUSES = ["DRAFT", "READY", "PUBLISHED"] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

export const PACK_STATUS_LABELS: Record<PackStatus, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  PUBLISHED: "Published",
};
