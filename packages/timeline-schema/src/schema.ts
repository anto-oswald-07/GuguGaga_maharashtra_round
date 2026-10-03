/**
 * Edit Timeline Zod schemas — schemaVersion "1.0" (SDD §4.3 / Phase 8 Dev D).
 */

import { z } from 'zod';

const nonEmptyId = z.string().trim().min(1).max(128);
const nonNegMs = z.number().finite().nonnegative();
const positiveMs = z.number().finite().positive();

export const textStyleSchema = z
  .object({
    position: z.enum(['top', 'center', 'bottom']).default('bottom'),
    fontSize: z.number().finite().positive().max(200).default(48),
    fontColor: z.string().trim().min(1).max(32).optional(),
    box: z.boolean().optional(),
  })
  .strict();
export type TextStyle = z.infer<typeof textStyleSchema>;

export const videoClipSchema = z
  .object({
    id: nonEmptyId,
    assetId: nonEmptyId,
    srcStartMs: nonNegMs,
    srcEndMs: positiveMs,
    timelineStartMs: nonNegMs,
    /** Optional UI / AI label (Arvin proposeTimeline). */
    label: z.string().max(200).optional(),
    /** Images hold stills for (srcEndMs - srcStartMs); default video. */
    mediaKind: z.enum(['video', 'image']).optional(),
  })
  .strict()
  .superRefine((clip, ctx) => {
    if (clip.srcEndMs <= clip.srcStartMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `srcEndMs must be > srcStartMs (clip ${clip.id})`,
        path: ['srcEndMs'],
      });
    }
  });
export type VideoClip = z.infer<typeof videoClipSchema>;

export const audioClipSchema = z
  .object({
    id: nonEmptyId,
    assetId: nonEmptyId,
    srcStartMs: nonNegMs,
    srcEndMs: positiveMs,
    timelineStartMs: nonNegMs,
    label: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((clip, ctx) => {
    if (clip.srcEndMs <= clip.srcStartMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `srcEndMs must be > srcStartMs (audio clip ${clip.id})`,
        path: ['srcEndMs'],
      });
    }
  });
export type AudioClip = z.infer<typeof audioClipSchema>;

export const textItemSchema = z
  .object({
    id: nonEmptyId,
    text: z.string().min(1).max(500),
    startMs: nonNegMs,
    endMs: positiveMs,
    style: textStyleSchema.optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.endMs <= item.startMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `endMs must be > startMs (text ${item.id})`,
        path: ['endMs'],
      });
    }
  });
export type TextItem = z.infer<typeof textItemSchema>;

export const captionItemSchema = z
  .object({
    id: nonEmptyId,
    text: z.string().min(1).max(500),
    startMs: nonNegMs,
    endMs: positiveMs,
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.endMs <= item.startMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `endMs must be > startMs (caption ${item.id})`,
        path: ['endMs'],
      });
    }
  });
export type CaptionItem = z.infer<typeof captionItemSchema>;

export const videoTrackSchema = z
  .object({
    id: nonEmptyId,
    type: z.literal('video'),
    clips: z.array(videoClipSchema).min(1),
  })
  .strict();
export type VideoTrack = z.infer<typeof videoTrackSchema>;

export const audioTrackSchema = z
  .object({
    id: nonEmptyId,
    type: z.literal('audio'),
    clips: z.array(audioClipSchema).default([]),
  })
  .strict();
export type AudioTrack = z.infer<typeof audioTrackSchema>;

export const textTrackSchema = z
  .object({
    id: nonEmptyId,
    type: z.literal('text'),
    items: z.array(textItemSchema).default([]),
  })
  .strict();
export type TextTrack = z.infer<typeof textTrackSchema>;

export const captionsTrackSchema = z
  .object({
    id: nonEmptyId,
    type: z.literal('captions'),
    items: z.array(captionItemSchema).default([]),
  })
  .strict();
export type CaptionsTrack = z.infer<typeof captionsTrackSchema>;

export const trackSchema = z.discriminatedUnion('type', [
  videoTrackSchema,
  audioTrackSchema,
  textTrackSchema,
  captionsTrackSchema,
]);
export type TimelineTrack = z.infer<typeof trackSchema>;

export const transitionSchema = z
  .object({
    id: nonEmptyId.optional(),
    type: z.string().trim().min(1).max(64),
    atMs: nonNegMs.optional(),
    durationMs: positiveMs.optional(),
  })
  .passthrough();
export type Transition = z.infer<typeof transitionSchema>;

export const timelineMetaSchema = z
  .object({
    /** `mock` allowed for AiProvider demo proposals (Arvin). */
    generatedBy: z.enum(['ai', 'user', 'system', 'mock']).optional(),
    prompt: z.string().max(2000).optional(),
    notes: z.string().max(2000).optional(),
    source: z.string().max(64).optional(),
  })
  .passthrough();
export type TimelineMeta = z.infer<typeof timelineMetaSchema>;

/**
 * Editable Edit Timeline — schemaVersion "1.0".
 * Rendering always reads this document (SDD §4.3).
 */
export const editTimelineSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    fps: z.number().finite().positive().max(120).default(30),
    durationMs: positiveMs,
    tracks: z.array(trackSchema).min(1),
    transitions: z.array(transitionSchema).default([]),
    meta: timelineMetaSchema.optional(),
  })
  .strict()
  .superRefine((tl, ctx) => {
    const videoTracks = tl.tracks.filter((t) => t.type === 'video');
    if (videoTracks.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'timeline must include at least one video track',
        path: ['tracks'],
      });
    }
  });

export type EditTimeline = z.infer<typeof editTimelineSchema>;
