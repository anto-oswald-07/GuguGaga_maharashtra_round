"use client";

import { useEditorStore } from "@/components/editor/editor-store";

export function InspectorPanel() {
  const {
    state,
    updateClip,
    updateAudioClip,
    updateText,
    updateCaption,
    removeClip,
  } = useEditorStore();
  const { draft, selected } = state;

  if (!selected) {
    return (
      <aside className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <h2 className="text-sm font-semibold">Inspector</h2>
        </div>
        <p className="p-3 text-sm text-[var(--muted)]">
          Select a clip or overlay on the tracks panel to edit.
        </p>
      </aside>
    );
  }

  if (selected.kind === "clip") {
    const track = draft.tracks.find(
      (t) => t.id === selected.trackId && t.type === "video",
    );
    const clip =
      track && track.type === "video"
        ? track.clips.find((c) => c.id === selected.itemId)
        : null;
    if (!clip) {
      return (
        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
          Clip not found.
        </aside>
      );
    }
    const isImage = clip.mediaKind === "image";
    const holdMs = Math.max(0, clip.srcEndMs - clip.srcStartMs);
    return (
      <aside className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <h2 className="text-sm font-semibold">
            Inspector · {isImage ? "Image still" : "Video clip"}
          </h2>
          <p className="font-mono text-[10px] text-[var(--muted)]">{clip.id}</p>
        </div>
        <div className="space-y-3 overflow-y-auto p-3 text-sm">
          <label className="block space-y-1">
            <span className="font-medium">Label</span>
            <input
              type="text"
              value={clip.label ?? ""}
              onChange={(e) =>
                updateClip(selected.trackId, clip.id, {
                  label: e.target.value,
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="font-medium">Asset ID</span>
            <input
              type="text"
              value={clip.assetId}
              onChange={(e) =>
                updateClip(selected.trackId, clip.id, {
                  assetId: e.target.value,
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          {isImage ? (
            <label className="block space-y-1">
              <span className="font-medium">Hold duration (ms)</span>
              <input
                type="number"
                min={250}
                value={holdMs}
                onChange={(e) => {
                  const next = Math.max(250, Number(e.target.value) || 250);
                  updateClip(selected.trackId, clip.id, {
                    srcStartMs: 0,
                    srcEndMs: next,
                    mediaKind: "image",
                  });
                }}
                className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="font-medium">Src start (ms)</span>
                <input
                  type="number"
                  min={0}
                  value={clip.srcStartMs}
                  onChange={(e) =>
                    updateClip(selected.trackId, clip.id, {
                      srcStartMs: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-medium">Src end (ms)</span>
                <input
                  type="number"
                  min={0}
                  value={clip.srcEndMs}
                  onChange={(e) =>
                    updateClip(selected.trackId, clip.id, {
                      srcEndMs: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          )}
          <p className="text-xs text-[var(--muted)]">
            Timeline start {clip.timelineStartMs} ms (set by sequence order)
          </p>
          <button
            type="button"
            onClick={() => removeClip(selected.trackId, clip.id, "video")}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800"
          >
            Remove from timeline
          </button>
          <p className="text-xs text-[var(--muted)]">
            {isImage
              ? "Images stay on screen for the hold duration. Reorder on the tracks panel."
              : "Trim by adjusting src start/end. Reorder clips on the tracks panel."}
          </p>
        </div>
      </aside>
    );
  }

  if (selected.kind === "audio") {
    const track = draft.tracks.find(
      (t) => t.id === selected.trackId && t.type === "audio",
    );
    const clip =
      track && track.type === "audio"
        ? track.clips.find((c) => c.id === selected.itemId)
        : null;
    if (!clip) {
      return (
        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
          Audio clip not found.
        </aside>
      );
    }
    return (
      <aside className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <h2 className="text-sm font-semibold">Inspector · Audio</h2>
          <p className="font-mono text-[10px] text-[var(--muted)]">{clip.id}</p>
        </div>
        <div className="space-y-3 overflow-y-auto p-3 text-sm">
          <label className="block space-y-1">
            <span className="font-medium">Label</span>
            <input
              type="text"
              value={clip.label ?? ""}
              onChange={(e) =>
                updateAudioClip(selected.trackId, clip.id, {
                  label: e.target.value,
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="font-medium">Asset ID</span>
            <input
              type="text"
              value={clip.assetId}
              onChange={(e) =>
                updateAudioClip(selected.trackId, clip.id, {
                  assetId: e.target.value,
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="font-medium">Src start (ms)</span>
              <input
                type="number"
                min={0}
                value={clip.srcStartMs}
                onChange={(e) =>
                  updateAudioClip(selected.trackId, clip.id, {
                    srcStartMs: Number(e.target.value),
                  })
                }
                className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Src end (ms)</span>
              <input
                type="number"
                min={0}
                value={clip.srcEndMs}
                onChange={(e) =>
                  updateAudioClip(selected.trackId, clip.id, {
                    srcEndMs: Number(e.target.value),
                  })
                }
                className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="font-medium">Timeline start (ms)</span>
            <input
              type="number"
              min={0}
              value={clip.timelineStartMs}
              onChange={(e) =>
                updateAudioClip(selected.trackId, clip.id, {
                  timelineStartMs: Number(e.target.value),
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => removeClip(selected.trackId, clip.id, "audio")}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800"
          >
            Remove from timeline
          </button>
          <p className="text-xs text-[var(--muted)]">
            Audio plays alongside the visual track at the timeline start time.
          </p>
        </div>
      </aside>
    );
  }

  if (selected.kind === "text") {
    const track = draft.tracks.find(
      (t) => t.id === selected.trackId && t.type === "text",
    );
    const item =
      track && track.type === "text"
        ? track.items.find((i) => i.id === selected.itemId)
        : null;
    if (!item) {
      return (
        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
          Text item not found.
        </aside>
      );
    }
    return (
      <aside className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <h2 className="text-sm font-semibold">Inspector · Text overlay</h2>
        </div>
        <div className="space-y-3 overflow-y-auto p-3 text-sm">
          <label className="block space-y-1">
            <span className="font-medium">Text</span>
            <textarea
              rows={3}
              value={item.text}
              onChange={(e) =>
                updateText(selected.trackId, item.id, { text: e.target.value })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="font-medium">Start (ms)</span>
              <input
                type="number"
                min={0}
                value={item.startMs}
                onChange={(e) =>
                  updateText(selected.trackId, item.id, {
                    startMs: Number(e.target.value),
                  })
                }
                className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">End (ms)</span>
              <input
                type="number"
                min={0}
                value={item.endMs}
                onChange={(e) =>
                  updateText(selected.trackId, item.id, {
                    endMs: Number(e.target.value),
                  })
                }
                className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="font-medium">Position</span>
            <select
              value={item.style?.position ?? "bottom"}
              onChange={(e) =>
                updateText(selected.trackId, item.id, {
                  style: { ...item.style, position: e.target.value },
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            >
              <option value="top">top</option>
              <option value="center">center</option>
              <option value="bottom">bottom</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-medium">Font size</span>
            <input
              type="number"
              min={8}
              value={item.style?.fontSize ?? 48}
              onChange={(e) =>
                updateText(selected.trackId, item.id, {
                  style: {
                    ...item.style,
                    fontSize: Number(e.target.value),
                  },
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </aside>
    );
  }

  // caption
  const track = draft.tracks.find(
    (t) => t.id === selected.trackId && t.type === "captions",
  );
  const item =
    track && track.type === "captions"
      ? track.items.find((i) => i.id === selected.itemId)
      : null;
  if (!item) {
    return (
      <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
        Caption not found.
      </aside>
    );
  }
  return (
    <aside className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-3 py-2">
        <h2 className="text-sm font-semibold">Inspector · Caption</h2>
      </div>
      <div className="space-y-3 overflow-y-auto p-3 text-sm">
        <label className="block space-y-1">
          <span className="font-medium">Text</span>
          <textarea
            rows={3}
            value={item.text}
            onChange={(e) =>
              updateCaption(selected.trackId, item.id, {
                text: e.target.value,
              })
            }
            className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="font-medium">Start (ms)</span>
            <input
              type="number"
              min={0}
              value={item.startMs}
              onChange={(e) =>
                updateCaption(selected.trackId, item.id, {
                  startMs: Number(e.target.value),
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="font-medium">End (ms)</span>
            <input
              type="number"
              min={0}
              value={item.endMs}
              onChange={(e) =>
                updateCaption(selected.trackId, item.id, {
                  endMs: Number(e.target.value),
                })
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>
    </aside>
  );
}
