/**
 * Timeline validation helpers (Phase 8 — Dev D).
 */

import { ZodError } from 'zod';
import { editTimelineSchema, type EditTimeline } from './schema';

export class TimelineValidationError extends Error {
  readonly issues: ZodError['issues'];

  constructor(message: string, issues: ZodError['issues']) {
    super(message);
    this.name = 'TimelineValidationError';
    this.issues = issues;
  }
}

/** Parse + validate; returns typed EditTimeline or throws TimelineValidationError. */
export function assertValidTimeline(input: unknown): EditTimeline {
  const parsed = editTimelineSchema.safeParse(input);
  if (!parsed.success) {
    throw new TimelineValidationError(
      `Invalid EditTimeline: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`,
      parsed.error.issues,
    );
  }
  return parsed.data;
}

/** Non-throwing parse — useful for API validation layers. */
export function safeParseTimeline(input: unknown) {
  return editTimelineSchema.safeParse(input);
}
