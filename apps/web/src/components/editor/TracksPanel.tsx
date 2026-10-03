"use client";

import { formatTimecode } from "@/lib/api";
import { useEditorStore } from "@/components/editor/editor-store";

export function TracksPanel() {
  const { state, select, reorderClip } = useEditorStore();
  const { draft, selected } = state;

  return (
    <section className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Tracks</h2>
          <p className="text-xs text-[var(--muted)]">
            Duration {formatTimecode(draft.durationMs)} · {draft.fps} fps ·
            schema {draft.schemaVersion}
          </p>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {draft.tracks.map((track) => (
          <div
            key={track.id}
            className="rounded-md border border-[var(--border)] bg-white"
          >
            <div className="border-b border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {track.type} · {track.id}
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {track.type === "video"
                ? track.clips.map((clip, index) => {
                    const active =
                      selected?.kind === "clip" &&
                      selected.trackId === track.id &&
                      selected.itemId === clip.id;
                    return (
                      <li key={clip.id} className="flex items-stretch gap-1 p-1">
                        <button
                          type="button"
                          onClick={() =>
                            select({
                              kind: "clip",
                              trackId: track.id,
                              itemId: clip.id,
                            })
                          }
                          className={`min-w-0 flex-1 rounded px-2 py-1.5 text-left text-xs ${
                            active
                              ? "bg-teal-50 text-teal-900"
                              : "hover:bg-[var(--background)]"
                          }`}
                        >
                          <p className="truncate font-medium">
                            Clip {index + 1} · {clip.assetId.slice(0, 8)}…
                          </p>
                          <p className="font-mono text-[10px] text-[var(--muted)]">
                            src {formatTimecode(clip.srcStartMs)}–
                            {formatTimecode(clip.srcEndMs)} · tl{" "}
                            {formatTimecode(clip.timelineStartMs)}
                          </p>
                        </button>
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            aria-label="Move clip earlier"
                            onClick={() => reorderClip(track.id, clip.id, -1)}
                            disabled={index === 0}
                            className="rounded border border-[var(--border)] px-1.5 text-[10px] disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label="Move clip later"
                            onClick={() => reorderClip(track.id, clip.id, 1)}
                            disabled={index === track.clips.length - 1}
                            className="rounded border border-[var(--border)] px-1.5 text-[10px] disabled:opacity-30"
                          >
                            ↓
                          </button>
                        </div>
                      </li>
                    );
                  })
                : track.items.map((item, index) => {
                    const kind =
                      track.type === "text" ? ("text" as const) : ("caption" as const);
                    const active =
                      selected?.kind === kind &&
                      selected.trackId === track.id &&
                      selected.itemId === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() =>
                            select({
                              kind,
                              trackId: track.id,
                              itemId: item.id,
                            })
                          }
                          className={`w-full px-2 py-1.5 text-left text-xs ${
                            active
                              ? "bg-teal-50 text-teal-900"
                              : "hover:bg-[var(--background)]"
                          }`}
                        >
                          <p className="truncate font-medium">
                            {kind === "text" ? "Text" : "Caption"} {index + 1}:{" "}
                            {item.text || "—"}
                          </p>
                          <p className="font-mono text-[10px] text-[var(--muted)]">
                            {formatTimecode(item.startMs)}–{formatTimecode(item.endMs)}
                          </p>
                        </button>
                      </li>
                    );
                  })}
              {track.type === "video" && track.clips.length === 0 ? (
                <li className="px-2 py-2 text-xs text-[var(--muted)]">
                  No clips on this track.
                </li>
              ) : null}
              {track.type !== "video" && track.items.length === 0 ? (
                <li className="px-2 py-2 text-xs text-[var(--muted)]">
                  No items on this track.
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
