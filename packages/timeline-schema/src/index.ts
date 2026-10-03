/**
 * @creatorai/timeline-schema — Edit Timeline JSON contract (schemaVersion 1.0).
 * Companion notes: docs/timeline-notes.md (FINAL).
 */

export {
  textStyleSchema,
  videoClipSchema,
  audioClipSchema,
  textItemSchema,
  captionItemSchema,
  videoTrackSchema,
  audioTrackSchema,
  textTrackSchema,
  captionsTrackSchema,
  trackSchema,
  transitionSchema,
  timelineMetaSchema,
  editTimelineSchema,
  type TextStyle,
  type VideoClip,
  type AudioClip,
  type TextItem,
  type CaptionItem,
  type VideoTrack,
  type AudioTrack,
  type TextTrack,
  type CaptionsTrack,
  type TimelineTrack,
  type Transition,
  type TimelineMeta,
  type EditTimeline,
} from './schema';

export {
  assertValidTimeline,
  safeParseTimeline,
  TimelineValidationError,
} from './assert';
