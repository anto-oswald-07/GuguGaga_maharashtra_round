"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  emptyTimelineJson,
  type TimelineAudioClip,
  type TimelineCaptionItem,
  type TimelineJson,
  type TimelineTextItem,
  type TimelineVideoClip,
} from "@/lib/api";

export type EditorSelection =
  | { kind: "clip"; trackId: string; itemId: string }
  | { kind: "audio"; trackId: string; itemId: string }
  | { kind: "text"; trackId: string; itemId: string }
  | { kind: "caption"; trackId: string; itemId: string }
  | null;

type EditorState = {
  timelineId: string | null;
  draft: TimelineJson;
  proposal: TimelineJson | null;
  selected: EditorSelection;
  dirty: boolean;
  previewAssetId: string | null;
};

type EditorAction =
  | { type: "hydrate"; timelineId: string | null; draft: TimelineJson }
  | { type: "setProposal"; proposal: TimelineJson | null }
  | { type: "applyProposal" }
  | {
      type: "applyAudioSuggestion";
      options?: {
        fallbackAssetId?: string;
        fallbackLabel?: string;
        fallbackClips?: TimelineAudioClip[];
      };
    }
  | { type: "applyCaptionsAndTextSuggestion" }
  | { type: "dismissProposal" }
  | { type: "select"; selected: EditorSelection }
  | { type: "markClean"; timelineId?: string }
  | { type: "setPreviewAssetId"; assetId: string | null }
  | {
      type: "updateClip";
      trackId: string;
      clipId: string;
      patch: Partial<TimelineVideoClip>;
    }
  | {
      type: "updateAudioClip";
      trackId: string;
      clipId: string;
      patch: Partial<TimelineAudioClip>;
    }
  | {
      type: "updateText";
      trackId: string;
      itemId: string;
      patch: Partial<TimelineTextItem>;
    }
  | {
      type: "updateCaption";
      trackId: string;
      itemId: string;
      patch: Partial<TimelineCaptionItem>;
    }
  | { type: "reorderClip"; trackId: string; clipId: string; direction: -1 | 1 }
  | {
      type: "reorderAudioClip";
      trackId: string;
      clipId: string;
      direction: -1 | 1;
    }
  | { type: "addVisualClip"; clip: TimelineVideoClip }
  | { type: "addAudioClip"; clip: TimelineAudioClip }
  | {
      type: "removeClip";
      trackId: string;
      clipId: string;
      trackType: "video" | "audio";
    }
  | {
      type: "removeTrackItem";
      trackId: string;
      itemId: string;
      trackType: "text" | "captions";
    }
  | {
      type: "clearTrack";
      trackId: string;
    }
  | { type: "replaceDraft"; draft: TimelineJson };

function cloneTimeline(t: TimelineJson): TimelineJson {
  return structuredClone(t);
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Ensure draft always has video + audio tracks for editor UX. */
export function ensureEditorTracks(draft: TimelineJson): TimelineJson {
  const next = cloneTimeline(draft);
  if (!next.tracks.some((t) => t.type === "video")) {
    next.tracks.unshift({ id: "v1", type: "video", clips: [] });
  }
  if (!next.tracks.some((t) => t.type === "audio")) {
    const videoIdx = next.tracks.findIndex((t) => t.type === "video");
    next.tracks.splice(videoIdx + 1, 0, { id: "a1", type: "audio", clips: [] });
  }
  if (!next.tracks.some((t) => t.type === "text")) {
    next.tracks.push({ id: "t1", type: "text", items: [] });
  }
  if (!next.tracks.some((t) => t.type === "captions")) {
    next.tracks.push({ id: "cap1", type: "captions", items: [] });
  }
  return next;
}

function clipLengthMs(clip: { srcStartMs: number; srcEndMs: number }): number {
  return Math.max(0, clip.srcEndMs - clip.srcStartMs);
}

function recomputeDuration(draft: TimelineJson): TimelineJson {
  let max = 0;
  for (const track of draft.tracks) {
    if (track.type === "video" || track.type === "audio") {
      for (const clip of track.clips ?? []) {
        max = Math.max(max, clip.timelineStartMs + clipLengthMs(clip));
      }
    } else {
      for (const item of track.items ?? []) {
        max = Math.max(max, item.endMs);
      }
    }
  }
  return { ...draft, durationMs: Math.max(0, max) };
}

function packSequentialClips<T extends { srcStartMs: number; srcEndMs: number; timelineStartMs: number }>(
  clips: T[],
): T[] {
  let cursor = 0;
  return clips.map((c) => {
    const len = clipLengthMs(c);
    const updated = { ...c, timelineStartMs: cursor };
    cursor += len;
    return updated;
  });
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        timelineId: action.timelineId,
        draft: ensureEditorTracks(action.draft),
        dirty: false,
        selected: null,
      };
    case "setProposal":
      return { ...state, proposal: action.proposal };
    case "applyProposal": {
      if (!state.proposal) return state;
      return {
        ...state,
        draft: ensureEditorTracks(state.proposal),
        proposal: null,
        dirty: true,
        selected: null,
      };
    }
    case "applyAudioSuggestion": {
      const draft = cloneTimeline(state.draft);
      const audioIdx = draft.tracks.findIndex((t) => t.type === "audio");
      const proposalAudioTrack = state.proposal?.tracks.find(
        (t) => t.type === "audio",
      );

      let newAudioClips: TimelineAudioClip[] = [];

      if (
        proposalAudioTrack &&
        proposalAudioTrack.type === "audio" &&
        proposalAudioTrack.clips &&
        proposalAudioTrack.clips.length > 0 &&
        proposalAudioTrack.clips.some((c) => Boolean(c.assetId))
      ) {
        newAudioClips = proposalAudioTrack.clips.map((c) => ({ ...c }));
      } else if (
        action.options?.fallbackClips &&
        action.options.fallbackClips.length > 0
      ) {
        newAudioClips = action.options.fallbackClips.map((c) => ({ ...c }));
      } else if (action.options?.fallbackAssetId) {
        const dur = Math.max(5000, draft.durationMs || 30_000);
        newAudioClips = [
          {
            id: `aud-${Date.now()}`,
            assetId: action.options.fallbackAssetId,
            srcStartMs: 0,
            srcEndMs: dur,
            timelineStartMs: 0,
            label: action.options.fallbackLabel || "Background Music",
          },
        ];
      }

      if (newAudioClips.length === 0) return state;

      if (audioIdx >= 0) {
        draft.tracks[audioIdx] = {
          ...draft.tracks[audioIdx],
          type: "audio",
          clips: newAudioClips,
        };
      } else {
        draft.tracks.push({
          id: "a1",
          type: "audio",
          clips: newAudioClips,
        });
      }
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
      };
    }
    case "applyCaptionsAndTextSuggestion": {
      if (!state.proposal) return state;
      const proposalTextTrack = state.proposal.tracks.find(
        (t) => t.type === "text",
      );
      const proposalCapTrack = state.proposal.tracks.find(
        (t) => t.type === "captions",
      );
      const draft = cloneTimeline(state.draft);
      if (proposalTextTrack && proposalTextTrack.type === "text") {
        const textIdx = draft.tracks.findIndex((t) => t.type === "text");
        const newTextItems = (proposalTextTrack.items ?? []).map((i) => ({ ...i }));
        if (textIdx >= 0) {
          draft.tracks[textIdx] = {
            ...draft.tracks[textIdx],
            type: "text",
            items: newTextItems,
          };
        } else {
          draft.tracks.push({
            id: "t1",
            type: "text",
            items: newTextItems,
          });
        }
      }
      if (proposalCapTrack && proposalCapTrack.type === "captions") {
        const capIdx = draft.tracks.findIndex((t) => t.type === "captions");
        const newCapItems = (proposalCapTrack.items ?? []).map((i) => ({ ...i }));
        if (capIdx >= 0) {
          draft.tracks[capIdx] = {
            ...draft.tracks[capIdx],
            type: "captions",
            items: newCapItems,
          };
        } else {
          draft.tracks.push({
            id: "cap1",
            type: "captions",
            items: newCapItems,
          });
        }
      }
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
      };
    }
    case "dismissProposal":
      return { ...state, proposal: null };
    case "select":
      return { ...state, selected: action.selected };
    case "markClean":
      return {
        ...state,
        dirty: false,
        ...(action.timelineId ? { timelineId: action.timelineId } : {}),
      };
    case "setPreviewAssetId":
      return { ...state, previewAssetId: action.assetId };
    case "replaceDraft":
      return {
        ...state,
        draft: recomputeDuration(ensureEditorTracks(action.draft)),
        dirty: true,
      };
    case "updateClip": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find(
        (t) => t.id === action.trackId && t.type === "video",
      );
      if (!track || track.type !== "video") return state;
      // Keep a contiguous visual sequence after hold/trim edits.
      track.clips = packSequentialClips(
        track.clips.map((c) =>
          c.id === action.clipId ? { ...c, ...action.patch, id: c.id } : c,
        ),
      );
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
      };
    }
    case "updateAudioClip": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find(
        (t) => t.id === action.trackId && t.type === "audio",
      );
      if (!track || track.type !== "audio") return state;
      track.clips = track.clips.map((c) =>
        c.id === action.clipId ? { ...c, ...action.patch, id: c.id } : c,
      );
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
      };
    }
    case "updateText": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find(
        (t) => t.id === action.trackId && t.type === "text",
      );
      if (!track || track.type !== "text") return state;
      track.items = track.items.map((item) =>
        item.id === action.itemId
          ? { ...item, ...action.patch, id: item.id }
          : item,
      );
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
      };
    }
    case "updateCaption": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find(
        (t) => t.id === action.trackId && t.type === "captions",
      );
      if (!track || track.type !== "captions") return state;
      track.items = track.items.map((item) =>
        item.id === action.itemId
          ? { ...item, ...action.patch, id: item.id }
          : item,
      );
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
      };
    }
    case "reorderClip": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find(
        (t) => t.id === action.trackId && t.type === "video",
      );
      if (!track || track.type !== "video") return state;
      const idx = track.clips.findIndex((c) => c.id === action.clipId);
      if (idx < 0) return state;
      const swap = idx + action.direction;
      if (swap < 0 || swap >= track.clips.length) return state;
      const next = [...track.clips];
      const tmp = next[idx]!;
      next[idx] = next[swap]!;
      next[swap] = tmp;
      track.clips = packSequentialClips(next);
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
      };
    }
    case "reorderAudioClip": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find(
        (t) => t.id === action.trackId && t.type === "audio",
      );
      if (!track || track.type !== "audio") return state;
      const idx = track.clips.findIndex((c) => c.id === action.clipId);
      if (idx < 0) return state;
      const swap = idx + action.direction;
      if (swap < 0 || swap >= track.clips.length) return state;
      const next = [...track.clips];
      const tmp = next[idx]!;
      next[idx] = next[swap]!;
      next[swap] = tmp;
      track.clips = packSequentialClips(next);
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
      };
    }
    case "addVisualClip": {
      const draft = ensureEditorTracks(cloneTimeline(state.draft));
      const track = draft.tracks.find((t) => t.type === "video");
      if (!track || track.type !== "video") return state;
      let cursor = 0;
      for (const c of track.clips) {
        cursor = Math.max(cursor, c.timelineStartMs + clipLengthMs(c));
      }
      track.clips = [
        ...track.clips,
        { ...action.clip, timelineStartMs: cursor },
      ];
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
        selected: {
          kind: "clip",
          trackId: track.id,
          itemId: action.clip.id,
        },
      };
    }
    case "addAudioClip": {
      const draft = ensureEditorTracks(cloneTimeline(state.draft));
      const track = draft.tracks.find((t) => t.type === "audio");
      if (!track || track.type !== "audio") return state;
      let cursor = 0;
      for (const c of track.clips) {
        cursor = Math.max(cursor, c.timelineStartMs + clipLengthMs(c));
      }
      track.clips = [
        ...track.clips,
        { ...action.clip, timelineStartMs: cursor },
      ];
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
        selected: {
          kind: "audio",
          trackId: track.id,
          itemId: action.clip.id,
        },
      };
    }
    case "removeClip": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find(
        (t) =>
          t.id === action.trackId &&
          (t.type === "video" || t.type === "audio") &&
          t.type === action.trackType,
      );
      if (!track || (track.type !== "video" && track.type !== "audio")) {
        return state;
      }
      track.clips = track.clips.filter((c) => c.id !== action.clipId);
      if (action.trackType === "video") {
        track.clips = packSequentialClips(track.clips);
      }
      const clearSelected =
        state.selected &&
        (state.selected.kind === "clip" || state.selected.kind === "audio") &&
        state.selected.itemId === action.clipId;
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
        selected: clearSelected ? null : state.selected,
      };
    }
    case "removeTrackItem": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find(
        (t) =>
          t.id === action.trackId &&
          (t.type === "text" || t.type === "captions") &&
          t.type === action.trackType,
      );
      if (!track || (track.type !== "text" && track.type !== "captions")) {
        return state;
      }
      track.items = track.items.filter((i) => i.id !== action.itemId);
      const clearSelected =
        state.selected &&
        (state.selected.kind === "text" || state.selected.kind === "caption") &&
        state.selected.itemId === action.itemId;
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
        selected: clearSelected ? null : state.selected,
      };
    }
    case "clearTrack": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find((t) => t.id === action.trackId);
      if (!track) return state;
      if (track.type === "text" || track.type === "captions") {
        track.items = [];
      } else if (track.type === "video" || track.type === "audio") {
        track.clips = [];
      }
      const clearSelected = state.selected?.trackId === action.trackId;
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
        selected: clearSelected ? null : state.selected,
      };
    }
    default:
      return state;
  }
}

type EditorStoreValue = {
  state: EditorState;
  hydrate: (timelineId: string | null, draft: TimelineJson) => void;
  setProposal: (proposal: TimelineJson | null) => void;
  applyProposal: () => void;
  applyAudioSuggestion: (options?: {
    fallbackAssetId?: string;
    fallbackLabel?: string;
    fallbackClips?: TimelineAudioClip[];
  }) => void;
  applyCaptionsAndTextSuggestion: () => void;
  dismissProposal: () => void;
  select: (selected: EditorSelection) => void;
  markClean: (timelineId?: string) => void;
  setPreviewAssetId: (assetId: string | null) => void;
  updateClip: (
    trackId: string,
    clipId: string,
    patch: Partial<TimelineVideoClip>,
  ) => void;
  updateAudioClip: (
    trackId: string,
    clipId: string,
    patch: Partial<TimelineAudioClip>,
  ) => void;
  updateText: (
    trackId: string,
    itemId: string,
    patch: Partial<TimelineTextItem>,
  ) => void;
  updateCaption: (
    trackId: string,
    itemId: string,
    patch: Partial<TimelineCaptionItem>,
  ) => void;
  reorderClip: (trackId: string, clipId: string, direction: -1 | 1) => void;
  reorderAudioClip: (
    trackId: string,
    clipId: string,
    direction: -1 | 1,
  ) => void;
  addVisualClip: (clip: Omit<TimelineVideoClip, "timelineStartMs"> & {
    timelineStartMs?: number;
  }) => void;
  addAudioClip: (clip: Omit<TimelineAudioClip, "timelineStartMs"> & {
    timelineStartMs?: number;
  }) => void;
  removeClip: (
    trackId: string,
    clipId: string,
    trackType: "video" | "audio",
  ) => void;
  removeTrackItem: (
    trackId: string,
    itemId: string,
    trackType: "text" | "captions",
  ) => void;
  clearTrack: (trackId: string) => void;
  replaceDraft: (draft: TimelineJson) => void;
  makeClipId: (prefix?: string) => string;
};

const EditorStoreContext = createContext<EditorStoreValue | null>(null);

const initialState: EditorState = {
  timelineId: null,
  draft: emptyTimelineJson(),
  proposal: null,
  selected: null,
  dirty: false,
  previewAssetId: null,
};

export function EditorStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);

  const hydrate = useCallback((timelineId: string | null, draft: TimelineJson) => {
    dispatch({ type: "hydrate", timelineId, draft });
  }, []);
  const setProposal = useCallback((proposal: TimelineJson | null) => {
    dispatch({ type: "setProposal", proposal });
  }, []);
  const applyProposal = useCallback(() => {
    dispatch({ type: "applyProposal" });
  }, []);
  const applyAudioSuggestion = useCallback(
    (options?: {
      fallbackAssetId?: string;
      fallbackLabel?: string;
      fallbackClips?: TimelineAudioClip[];
    }) => {
      dispatch({ type: "applyAudioSuggestion", options });
    },
    [],
  );
  const applyCaptionsAndTextSuggestion = useCallback(() => {
    dispatch({ type: "applyCaptionsAndTextSuggestion" });
  }, []);
  const dismissProposal = useCallback(() => {
    dispatch({ type: "dismissProposal" });
  }, []);
  const select = useCallback((selected: EditorSelection) => {
    dispatch({ type: "select", selected });
  }, []);
  const markClean = useCallback((timelineId?: string) => {
    dispatch({ type: "markClean", timelineId });
  }, []);
  const setPreviewAssetId = useCallback((assetId: string | null) => {
    dispatch({ type: "setPreviewAssetId", assetId });
  }, []);
  const updateClip = useCallback(
    (trackId: string, clipId: string, patch: Partial<TimelineVideoClip>) => {
      dispatch({ type: "updateClip", trackId, clipId, patch });
    },
    [],
  );
  const updateAudioClip = useCallback(
    (trackId: string, clipId: string, patch: Partial<TimelineAudioClip>) => {
      dispatch({ type: "updateAudioClip", trackId, clipId, patch });
    },
    [],
  );
  const updateText = useCallback(
    (trackId: string, itemId: string, patch: Partial<TimelineTextItem>) => {
      dispatch({ type: "updateText", trackId, itemId, patch });
    },
    [],
  );
  const updateCaption = useCallback(
    (trackId: string, itemId: string, patch: Partial<TimelineCaptionItem>) => {
      dispatch({ type: "updateCaption", trackId, itemId, patch });
    },
    [],
  );
  const reorderClip = useCallback(
    (trackId: string, clipId: string, direction: -1 | 1) => {
      dispatch({ type: "reorderClip", trackId, clipId, direction });
    },
    [],
  );
  const reorderAudioClip = useCallback(
    (trackId: string, clipId: string, direction: -1 | 1) => {
      dispatch({ type: "reorderAudioClip", trackId, clipId, direction });
    },
    [],
  );
  const addVisualClip = useCallback(
    (
      clip: Omit<TimelineVideoClip, "timelineStartMs"> & {
        timelineStartMs?: number;
      },
    ) => {
      dispatch({
        type: "addVisualClip",
        clip: {
          ...clip,
          timelineStartMs: clip.timelineStartMs ?? 0,
        },
      });
    },
    [],
  );
  const addAudioClip = useCallback(
    (
      clip: Omit<TimelineAudioClip, "timelineStartMs"> & {
        timelineStartMs?: number;
      },
    ) => {
      dispatch({
        type: "addAudioClip",
        clip: {
          ...clip,
          timelineStartMs: clip.timelineStartMs ?? 0,
        },
      });
    },
    [],
  );
  const removeClip = useCallback(
    (trackId: string, clipId: string, trackType: "video" | "audio") => {
      dispatch({ type: "removeClip", trackId, clipId, trackType });
    },
    [],
  );
  const removeTrackItem = useCallback(
    (trackId: string, itemId: string, trackType: "text" | "captions") => {
      dispatch({ type: "removeTrackItem", trackId, itemId, trackType });
    },
    [],
  );
  const clearTrack = useCallback((trackId: string) => {
    dispatch({ type: "clearTrack", trackId });
  }, []);
  const replaceDraft = useCallback((draft: TimelineJson) => {
    dispatch({ type: "replaceDraft", draft });
  }, []);
  const makeClipId = useCallback((prefix = "c") => newId(prefix), []);

  const value = useMemo(
    () => ({
      state,
      hydrate,
      setProposal,
      applyProposal,
      applyAudioSuggestion,
      applyCaptionsAndTextSuggestion,
      dismissProposal,
      select,
      markClean,
      setPreviewAssetId,
      updateClip,
      updateAudioClip,
      updateText,
      updateCaption,
      reorderClip,
      reorderAudioClip,
      addVisualClip,
      addAudioClip,
      removeClip,
      removeTrackItem,
      clearTrack,
      replaceDraft,
      makeClipId,
    }),
    [
      state,
      hydrate,
      setProposal,
      applyProposal,
      applyAudioSuggestion,
      applyCaptionsAndTextSuggestion,
      dismissProposal,
      select,
      markClean,
      setPreviewAssetId,
      updateClip,
      updateAudioClip,
      updateText,
      updateCaption,
      reorderClip,
      reorderAudioClip,
      addVisualClip,
      addAudioClip,
      removeClip,
      removeTrackItem,
      clearTrack,
      replaceDraft,
      makeClipId,
    ],
  );

  return (
    <EditorStoreContext.Provider value={value}>
      {children}
    </EditorStoreContext.Provider>
  );
}

export function useEditorStore() {
  const ctx = useContext(EditorStoreContext);
  if (!ctx) {
    throw new Error("useEditorStore must be used within EditorStoreProvider");
  }
  return ctx;
}
