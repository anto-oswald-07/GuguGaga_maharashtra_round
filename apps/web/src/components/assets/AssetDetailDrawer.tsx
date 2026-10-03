"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, Asset, deleteAsset, updateAsset } from "@/lib/api";

type AssetDetailDrawerProps = {
  asset: Asset | null;
  onClose: () => void;
  onChanged: () => void;
};

export function AssetDetailDrawer({
  asset,
  onClose,
  onChanged,
}: AssetDetailDrawerProps) {
  const [tagsInput, setTagsInput] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setTagsInput(asset.tags?.join(", ") ?? "");
    setDescription(asset.description ?? "");
    setError(null);
  }, [asset]);

  if (!asset) return null;

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    setPending(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await updateAsset(asset.id, {
        tags,
        description: description.trim() || null,
      });
      onChanged();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save failed",
      );
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!asset) return;
    if (!window.confirm(`Delete “${asset.name}”?`)) return;
    setPending(true);
    setError(null);
    try {
      await deleteAsset(asset.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Delete failed",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" role="dialog" aria-modal="true">
      <button
        type="button"
        className="flex-1 cursor-default"
        aria-label="Close asset details"
        onClick={onClose}
      />
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {asset.type}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">{asset.name}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {asset.mime} · {(asset.size / 1024).toFixed(1)} KB
            </p>
            {asset.type === "VIDEO" && asset.metadata ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                {[
                  typeof asset.metadata.durationMs === "number"
                    ? `${(asset.metadata.durationMs / 1000).toFixed(1)}s`
                    : null,
                  typeof asset.metadata.width === "number" &&
                  typeof asset.metadata.height === "number"
                    ? `${asset.metadata.width}×${asset.metadata.height}`
                    : null,
                  typeof asset.metadata.codec === "string"
                    ? asset.metadata.codec
                    : null,
                  typeof asset.metadata.thumbnailSource === "string"
                    ? `thumb:${asset.metadata.thumbnailSource}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm text-[var(--muted)]"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Tags (comma-separated)</span>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--brand)]"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Description</span>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--brand)]"
            />
          </label>

          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
