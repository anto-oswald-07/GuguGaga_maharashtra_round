import { z } from 'zod';

/**
 * Timeline version provenance (FR-ED-006).
 * AI proposals never become current until the user Applies (PUT) or Integration wires Apply.
 */
export const timelineSourceSchema = z.enum(['user', 'ai_proposal']);
export type TimelineSource = z.infer<typeof timelineSourceSchema>;

export const TIMELINE_SOURCES = timelineSourceSchema.options;

/** Text / caption style (MVP). */
export const timelineTextStyleSchema = z
  .object({
    position: z.enum(['top', 'center', 'bottom']).optional(),
    fontSize: z.number().positive().optional(),
  })
  .passthrough();

export const timelineVideoClipSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().uuid(),
  srcStartMs: z.number().int().nonnegative(),
  srcEndMs: z.number().int().nonnegative(),
  timelineStartMs: z.number().int().nonnegative(),
  label: z.string().max(200).optional(),
  /**
   * Visual media kind. Images use srcStart/srcEnd as the on-timeline hold
   * duration (usually 0 → durationMs). Default video when omitted.
   */
  mediaKind: z.enum(['video', 'image']).optional(),
});

/** Audio clip on an audio track (plays alongside the visual timeline). */
export const timelineAudioClipSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().uuid(),
  srcStartMs: z.number().int().nonnegative(),
  srcEndMs: z.number().int().nonnegative(),
  timelineStartMs: z.number().int().nonnegative(),
  label: z.string().max(200).optional(),
});

export const timelineTextItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  style: timelineTextStyleSchema.optional(),
});

export const timelineCaptionItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});

export const timelineVideoTrackSchema = z.object({
  id: z.string().min(1),
  type: z.literal('video'),
  clips: z.array(timelineVideoClipSchema),
});

export const timelineAudioTrackSchema = z.object({
  id: z.string().min(1),
  type: z.literal('audio'),
  clips: z.array(timelineAudioClipSchema),
});

export const timelineTextTrackSchema = z.object({
  id: z.string().min(1),
  type: z.literal('text'),
  items: z.array(timelineTextItemSchema),
});

export const timelineCaptionsTrackSchema = z.object({
  id: z.string().min(1),
  type: z.literal('captions'),
  items: z.array(timelineCaptionItemSchema),
});

export const timelineTrackSchema = z.discriminatedUnion('type', [
  timelineVideoTrackSchema,
  timelineAudioTrackSchema,
  timelineTextTrackSchema,
  timelineCaptionsTrackSchema,
]);

/**
 * Edit timeline JSON (SDD §4.3). Lightweight validation until
 * `packages/timeline-schema` (Cyrus) lands — Integration may swap assertValidTimeline.
 */
export const editTimelineJsonSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    fps: z.number().positive(),
    durationMs: z.number().int().nonnegative(),
    tracks: z.array(timelineTrackSchema),
    transitions: z.array(z.unknown()).optional().default([]),
    meta: z.record(z.unknown()).optional(),
  })
  .superRefine((doc, ctx) => {
    for (const track of doc.tracks) {
      if (track.type === 'video' || track.type === 'audio') {
        for (const clip of track.clips) {
          if (clip.srcEndMs <= clip.srcStartMs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${track.type} clip ${clip.id}: srcEndMs must be > srcStartMs`,
            });
          }
        }
      } else {
        for (const item of track.items) {
          if (item.endMs <= item.startMs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Item ${item.id}: endMs must be > startMs`,
            });
          }
        }
      }
    }
  });
export type EditTimelineJson = z.infer<typeof editTimelineJsonSchema>;

export function assertValidTimelineJson(raw: unknown): EditTimelineJson {
  return editTimelineJsonSchema.parse(raw);
}

export const timelineVersionSchema = z.object({
  id: z.string().uuid(),
  editTimelineId: z.string().uuid(),
  version: z.number().int().positive(),
  content: editTimelineJsonSchema,
  source: timelineSourceSchema,
  createdAt: z.string().datetime(),
});
export type TimelineVersionDto = z.infer<typeof timelineVersionSchema>;

export const editTimelineSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().nullable(),
  currentVersionId: z.string().uuid().nullable(),
  previewAssetId: z.string().uuid().nullable(),
  /** Applied/saved JSON only — null until first PUT (or Apply via PUT). */
  current: editTimelineJsonSchema.nullable(),
  /** Latest AI_PROPOSAL version content if newer than / not equal to current. */
  pendingProposal: editTimelineJsonSchema.nullable(),
  pendingProposalVersionId: z.string().uuid().nullable(),
  versionCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type EditTimelineDto = z.infer<typeof editTimelineSchema>;

export const editTimelineDetailSchema = editTimelineSchema.extend({
  versions: z.array(timelineVersionSchema),
});
export type EditTimelineDetailDto = z.infer<typeof editTimelineDetailSchema>;

export const timelineListResponseSchema = z.object({
  items: z.array(editTimelineSchema),
});
export type TimelineListResponse = z.infer<typeof timelineListResponseSchema>;

/** Body for `POST /projects/:id/timelines/generate`. */
export const generateTimelineRequestSchema = z.object({
  /** When omitted, API uses latest script on the project. */
  scriptId: z.string().uuid().optional(),
  /** Optional title for the EditTimeline document. */
  title: z.string().min(1).max(255).optional(),
  /**
   * Existing timeline to append a proposal onto.
   * When omitted, get-or-create the project's primary timeline.
   */
  timelineId: z.string().uuid().optional(),
});
export type GenerateTimelineRequest = z.infer<
  typeof generateTimelineRequestSchema
>;

/**
 * Body for `PUT /timelines/:id`.
 * Creates a new USER TimelineVersion and sets it current (Apply semantics).
 */
export const putTimelineRequestSchema = z.object({
  timeline: editTimelineJsonSchema,
  title: z.string().min(1).max(255).optional(),
});
export type PutTimelineRequest = z.infer<typeof putTimelineRequestSchema>;
