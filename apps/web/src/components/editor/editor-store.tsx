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
  type TimelineCaptionItem,
  type TimelineJson,
  type TimelineTextItem,
  type TimelineVideoClip,
} from "@/lib/api";

export type EditorSelection =
  | { kind: "clip"; trackId: string; itemId: string }
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
  | { type: "replaceDraft"; draft: TimelineJson };

function cloneTimeline(t: TimelineJson): TimelineJson {
  return structuredClone(t);
}

function recomputeDuration(draft: TimelineJson): TimelineJson {
  let max = 0;
  for (const track of draft.tracks) {
    if (track.type === "video") {
      for (const clip of track.clips) {
        const len = Math.max(0, clip.srcEndMs - clip.srcStartMs);
        max = Math.max(max, clip.timelineStartMs + len);
      }
    } else {
      for (const item of track.items) {
        max = Math.max(max, item.endMs);
      }
    }
  }
  return { ...draft, durationMs: Math.max(draft.durationMs, max) };
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        timelineId: action.timelineId,
        draft: cloneTimeline(action.draft),
        dirty: false,
        selected: null,
      };
    case "setProposal":
      return { ...state, proposal: action.proposal };
    case "applyProposal": {
      if (!state.proposal) return state;
      return {
        ...state,
        draft: cloneTimeline(state.proposal),
        proposal: null,
        dirty: true,
        selected: null,
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
        draft: recomputeDuration(cloneTimeline(action.draft)),
        dirty: true,
      };
    case "updateClip": {
      const draft = cloneTimeline(state.draft);
      const track = draft.tracks.find(
        (t) => t.id === action.trackId && t.type === "video",
      );
      if (!track || track.type !== "video") return state;
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
      // Keep sequential timeline starts after reorder
      let cursor = 0;
      track.clips = next.map((c) => {
        const len = Math.max(0, c.srcEndMs - c.srcStartMs);
        const updated = { ...c, timelineStartMs: cursor };
        cursor += len;
        return updated;
      });
      return {
        ...state,
        draft: recomputeDuration(draft),
        dirty: true,
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
  dismissProposal: () => void;
  select: (selected: EditorSelection) => void;
  markClean: (timelineId?: string) => void;
  setPreviewAssetId: (assetId: string | null) => void;
  updateClip: (
    trackId: string,
    clipId: string,
    patch: Partial<TimelineVideoClip>,
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
  replaceDraft: (draft: TimelineJson) => void;
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
  const replaceDraft = useCallback((draft: TimelineJson) => {
    dispatch({ type: "replaceDraft", draft });
  }, []);

  const value = useMemo(
    () => ({
      state,
      hydrate,
      setProposal,
      applyProposal,
      dismissProposal,
      select,
      markClean,
      setPreviewAssetId,
      updateClip,
      updateText,
      updateCaption,
      reorderClip,
      replaceDraft,
    }),
    [
      state,
      hydrate,
      setProposal,
      applyProposal,
      dismissProposal,
      select,
      markClean,
      setPreviewAssetId,
      updateClip,
      updateText,
      updateCaption,
      reorderClip,
      replaceDraft,
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
