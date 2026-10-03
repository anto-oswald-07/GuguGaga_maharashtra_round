import { z } from 'zod';

/**
 * Project lifecycle stages — names match SDD §4.2 `ProjectStage`
 * (and Anto’s Prisma enum when Phase 4 B lands).
 */
export const projectStageSchema = z.enum([
  'IDEA',
  'SCRIPT',
  'RECORDED',
  'EDITING',
  'CLIPS',
  'ADAPTED',
  'READY',
  'PUBLISHED',
]);

export type ProjectStage = z.infer<typeof projectStageSchema>;

/** Canonical forward order for boards, progress bars, and stageIndex. */
export const DEFAULT_STAGE_ORDER: readonly ProjectStage[] = [
  'IDEA',
  'SCRIPT',
  'RECORDED',
  'EDITING',
  'CLIPS',
  'ADAPTED',
  'READY',
  'PUBLISHED',
] as const;

/** Alias for callers that prefer a function over the constant array. */
export function defaultStageOrder(): readonly ProjectStage[] {
  return DEFAULT_STAGE_ORDER;
}

/**
 * Zero-based index in `defaultStageOrder`, or `-1` if the value is not a known stage.
 */
export function stageIndex(stage: string): number {
  return (DEFAULT_STAGE_ORDER as readonly string[]).indexOf(stage);
}

/** `PUBLISHED` is the terminal stage (no further forward progress). */
export function isTerminalStage(stage: string): boolean {
  return stage === 'PUBLISHED';
}

/** True when `stage` parses as a `ProjectStage` enum value. */
export function isProjectStage(stage: string): stage is ProjectStage {
  return projectStageSchema.safeParse(stage).success;
}
