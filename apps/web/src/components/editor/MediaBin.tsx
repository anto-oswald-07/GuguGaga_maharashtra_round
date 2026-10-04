"use client";

import { useState } from "react";
import type { Asset } from "@/lib/api";
import { formatTimecode } from "@/lib/api";
import { useEditorStore } from "@/components/editor/editor-store";

const DEFAULT_IMAGE_HOLD_MS = 3000;
const DEFAULT_AUDIO_MS = 5000;

type MediaBinProps = {
  assets: Asset[];
  loading?: boolean;
  fulfilledScenesCount?: number;
  onSequenceScenes?: () => void;
};

function assetDurationMs(asset: Asset): number | null {
  if (typeof asset.metadata?.durationMs === "number") {
    return asset.metadata.durationMs;
  }
  if (typeof asset.metadata?.durationSec === "number") {
    return Number(asset.metadata.durationSec) * 1000;
  }
  return null;
}

export function MediaBin({
  assets,
  loading,
  fulfilledScenesCount,
  onSequenceScenes,
}: MediaBinProps) {
  const { addVisualClip, addAudioClip, makeClipId } = useEditorStore();
  const [imageHoldMs, setImageHoldMs] = useState(DEFAULT_IMAGE_HOLD_MS);
  const [message, setMessage] = useState<string | null>(null);

  function onAdd(asset: Asset) {
    setMessage(null);
    if (asset.type === "IMAGE") {
      const hold = Math.max(250, imageHoldMs || DEFAULT_IMAGE_HOLD_MS);
      addVisualClip({
        id: makeClipId("img"),
        assetId: asset.id,
        srcStartMs: 0,
        srcEndMs: hold,
        mediaKind: "image",
        label: asset.name,
      });
      setMessage(`Added image for ${formatTimecode(hold)}`);
      return;
    }
    if (asset.type === "AUDIO") {
      const dur = assetDurationMs(asset) ?? DEFAULT_AUDIO_MS;
      addAudioClip({
        id: makeClipId("aud"),
        assetId: asset.id,
        srcStartMs: 0,
        srcEndMs: Math.max(250, dur),
        label: asset.name,
      });
      setMessage(`Added audio (${formatTimecode(dur)})`);
      return;
    }
    if (asset.type === "VIDEO") {
      const dur = assetDurationMs(asset) ?? 5000;
      addVisualClip({
        id: makeClipId("vid"),
        assetId: asset.id,
        srcStartMs: 0,
        srcEndMs: Math.max(250, dur),
        mediaKind: "video",
        label: asset.name,
      });
      setMessage(`Added video (${formatTimecode(dur)})`);
      return;
    }
    setMessage("Only VIDEO, IMAGE, and AUDIO can be sequenced.");
  }

  const usable = assets.filter(
    (a) =>
      (a.type === "VIDEO" || a.type === "IMAGE" || a.type === "AUDIO") &&
      !a.deletedAt,
  );

  return (
    <aside className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-3 py-2">
        <h2 className="text-sm font-semibold">
          Bin ({assets.length} media item{assets.length === 1 ? "" : "s"})
        </h2>
        <p className="text-xs text-[var(--muted)]">
          Add video, image, or audio to the timeline
        </p>
      </div>
      {fulfilledScenesCount && onSequenceScenes ? (
        <div className="border-b border-[var(--border)] bg-[var(--brand)]/5 p-2">
          <button
            type="button"
            onClick={onSequenceScenes}
            className="w-full rounded bg-[var(--brand)] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand)]/90 transition flex items-center justify-center shadow-xs"
            title="Auto-sequence clips from script scenes onto the video track"
          >
            Auto-sequence scenes ({fulfilledScenesCount})
          </button>
        </div>
      ) : null}
      <div className="space-y-2 border-b border-[var(--border)] px-3 py-2">
        <label className="block space-y-1 text-xs">
          <span className="font-medium text-[var(--muted)]">
            Image hold duration (ms)
          </span>
          <input
            type="number"
            min={250}
            step={250}
            value={imageHoldMs}
            onChange={(e) => setImageHoldMs(Number(e.target.value) || DEFAULT_IMAGE_HOLD_MS)}
            className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
          />
        </label>
        {message ? (
          <p className="text-[10px] text-[var(--brand)]">{message}</p>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="px-1 text-xs text-[var(--muted)]">Loading…</p>
        ) : usable.length === 0 ? (
          <p className="px-1 text-xs text-[var(--muted)]">
            No VIDEO / IMAGE / AUDIO assets attached. Attach media on the
            project Overview.
          </p>
        ) : (
          <ul className="space-y-1">
            {usable.map((asset) => {
              const duration = assetDurationMs(asset);
              return (
                <li
                  key={asset.id}
                  className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-xs"
                  title={asset.id}
                >
                  <p className="truncate font-medium">{asset.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                    {asset.type}
                    {duration != null ? ` · ${formatTimecode(duration)}` : ""}
                    {asset.type === "IMAGE"
                      ? ` · hold ${formatTimecode(imageHoldMs)}`
                      : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => onAdd(asset)}
                    className="mt-1.5 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[11px] font-medium hover:border-[var(--brand)]"
                  >
                    {asset.type === "IMAGE"
                      ? "Add still"
                      : asset.type === "AUDIO"
                        ? "Add to audio track"
                        : "Add to video track"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
