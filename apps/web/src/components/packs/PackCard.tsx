"use client";

import { useEffect, useState } from "react";
import {
  ASPECT_RATIO_LABELS,
  PACK_STATUSES,
  PACK_STATUS_LABELS,
  PLATFORM_LABELS,
  type PackStatus,
} from "@/components/packs/constants";
import type {
  PlatformPackDto,
  UpdatePackCopyPayload,
} from "@/lib/api";

type PackCardProps = {
  pack: PlatformPackDto;
  busy?: boolean;
  onSaveCopy: (packId: string, payload: UpdatePackCopyPayload) => void;
  onStatusChange: (packId: string, status: PackStatus) => void;
  onDownload: (packId: string) => void;
  onDelete: (packId: string) => void;
};

function hashtagsToText(tags: string[]) {
  return tags.join(" ");
}

function textToHashtags(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
}

export function PackCard({
  pack,
  busy,
  onSaveCopy,
  onStatusChange,
  onDownload,
  onDelete,
}: PackCardProps) {
  const [title, setTitle] = useState(pack.title);
  const [caption, setCaption] = useState(pack.caption);
  const [hashtagsText, setHashtagsText] = useState(hashtagsToText(pack.hashtags));
  const hashtagsKey = pack.hashtags.join("\0");

  useEffect(() => {
    const t = window.setTimeout(() => {
      setTitle(pack.title);
      setCaption(pack.caption);
      setHashtagsText(hashtagsToText(pack.hashtags));
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hashtagsKey tracks pack.hashtags contents
  }, [pack.id, pack.title, pack.caption, hashtagsKey]);

  const dirty =
    title !== pack.title ||
    caption !== pack.caption ||
    hashtagsToText(pack.hashtags) !== hashtagsText.trim();

  function saveCopy() {
    onSaveCopy(pack.id, {
      title: title.trim(),
      caption: caption.trim(),
      hashtags: textToHashtags(hashtagsText),
    });
  }

  return (
    <article className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {PLATFORM_LABELS[pack.platform] ?? pack.platform}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Aspect{" "}
            <span className="font-medium text-[var(--foreground)]">
              {ASPECT_RATIO_LABELS[pack.aspectRatio] ?? pack.aspectRatio}
            </span>
            {pack.outputAssetIds.length > 0 ? (
              <>
                {" "}
                · {pack.outputAssetIds.length} output asset
                {pack.outputAssetIds.length === 1 ? "" : "s"}
              </>
            ) : null}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">Status</span>
          <select
            value={pack.status}
            disabled={busy}
            onChange={(e) =>
              onStatusChange(pack.id, e.target.value as PackStatus)
            }
            className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
          >
            {PACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PACK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          type="text"
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Caption</span>
        <textarea
          value={caption}
          disabled={busy}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Hashtags</span>
        <input
          type="text"
          value={hashtagsText}
          disabled={busy}
          onChange={(e) => setHashtagsText(e.target.value)}
          placeholder="#creator #shortform"
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={saveCopy}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Save copy
        </button>
        <button
          type="button"
          disabled={busy || pack.status === "READY"}
          onClick={() => onStatusChange(pack.id, "READY")}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Mark Ready
        </button>
        <button
          type="button"
          disabled={busy || pack.status === "PUBLISHED"}
          onClick={() => onStatusChange(pack.id, "PUBLISHED")}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Mark Published
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDownload(pack.id)}
          className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Download
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(pack.id)}
          className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800 disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {pack.outputAssetIds.length > 0 ? (
        <ul className="space-y-1 font-mono text-[10px] text-[var(--muted)]">
          {pack.outputAssetIds.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
