/**
 * TODO_SHARED: Prefer importing from `@creatorai/shared` once web depends on it
 * and `packages/shared/src/index.ts` re-exports projects cleanly.
 * Names match SDD §4.2 / `packages/shared` ProjectStage + Platform.
 */

export const PROJECT_STAGES = [
  "IDEA",
  "SCRIPT",
  "RECORDED",
  "EDITING",
  "CLIPS",
  "ADAPTED",
  "READY",
  "PUBLISHED",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const STAGE_LABELS: Record<ProjectStage, string> = {
  IDEA: "Idea",
  SCRIPT: "Script",
  RECORDED: "Recorded",
  EDITING: "Editing",
  CLIPS: "Clips",
  ADAPTED: "Adapted",
  READY: "Ready",
  PUBLISHED: "Published",
};

export const PLATFORMS = [
  "YOUTUBE",
  "YOUTUBE_SHORTS",
  "INSTAGRAM_REELS",
  "TIKTOK",
  "LINKEDIN",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  YOUTUBE: "YouTube",
  YOUTUBE_SHORTS: "YouTube Shorts",
  INSTAGRAM_REELS: "Instagram Reels",
  TIKTOK: "TikTok",
  LINKEDIN: "LinkedIn",
};
