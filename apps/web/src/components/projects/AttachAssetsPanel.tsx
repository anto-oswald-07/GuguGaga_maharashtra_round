"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  attachProjectAssets,
  detachProjectAssets,
  listAssets,
  type Asset,
  type Project,
} from "@/components/projects/project-api";
import { ClipPlayer } from "@/components/assets/ClipPlayer";

type AttachAssetsPanelProps = {
  project: Project;
  onChanged: (project: Project) => void;
};

export function AttachAssetsPanel({
  project,
  onChanged,
}: AttachAssetsPanelProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  const attachedSet = useMemo(
    () => new Set(project.assetIds),
    [project.assetIds],
  );

  const available = useMemo(
    () => assets.filter((a) => !attachedSet.has(a.id)),
    [assets, attachedSet],
  );

  const attached = useMemo(
    () => assets.filter((a) => attachedSet.has(a.id)),
    [assets, attachedSet],
  );

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const result = await listAssets();
          if (!cancelled) setAssets(result.items ?? []);
        } catch (err) {
          if (!cancelled) {
            setAssets([]);
            setError(
              err instanceof ApiError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : "Failed to load assets",
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onAttach() {
    if (selected.length === 0) {
      setError("Select at least one asset to attach.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const updated = await attachProjectAssets(project.id, selected);
      setSelected([]);
      onChanged(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Attach failed",
      );
    } finally {
      setPending(false);
    }
  }

  async function onDetach(assetId: string) {
    setPending(true);
    setError(null);
    try {
      const updated = await detachProjectAssets(project.id, [assetId]);
      onChanged(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Detach failed",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {previewAsset ? (
        <div className="rounded-lg border border-[var(--brand)]/30 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--foreground)]">Preview Clip</span>
            <button
              type="button"
              onClick={() => setPreviewAsset(null)}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              ✕ Close
            </button>
          </div>
          <ClipPlayer
            assetId={previewAsset.id}
            title={previewAsset.name}
            type={previewAsset.type}
            mime={previewAsset.mime}
            onClose={() => setPreviewAsset(null)}
          />
        </div>
      ) : null}

      <div>
        <h3 className="flex items-center justify-between text-sm font-semibold">
          <span>Attached assets</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-700">
            {project.assetIds?.length ?? 0}
          </span>
        </h3>
        {loading ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Loading library…</p>
        ) : null}
        {!loading && attached.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">None attached yet.</p>
        ) : null}
        {attached.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {attached.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
              >
                <span className="truncate">
                  <span className="font-medium">{asset.name}</span>
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {asset.type}
                  </span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewAsset((curr) => (curr?.id === asset.id ? null : asset))
                    }
                    className="text-xs font-medium text-[var(--brand)] hover:underline"
                  >
                    {previewAsset?.id === asset.id ? "Hide" : "▶ View"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void onDetach(asset.id)}
                    className="text-xs text-red-700 hover:underline disabled:opacity-40"
                  >
                    Detach
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold">Attach from library</h3>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Multi-select assets that are not yet on this project.
        </p>
        {!loading && available.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            No more assets available. Upload some in the Asset library.
          </p>
        ) : null}
        {available.length > 0 ? (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] bg-white p-2">
            {available.map((asset) => {
              const checked = selected.includes(asset.id);
              return (
                <li
                  key={asset.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-[var(--background)]"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(asset.id)}
                    />
                    <span className="truncate font-medium">{asset.name}</span>
                    <span className="ml-auto text-xs text-[var(--muted)]">
                      {asset.type}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setPreviewAsset((curr) => (curr?.id === asset.id ? null : asset));
                    }}
                    className="shrink-0 text-xs font-medium text-[var(--brand)] hover:underline"
                  >
                    {previewAsset?.id === asset.id ? "Hide" : "▶ View"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <button
          type="button"
          disabled={pending || selected.length === 0}
          onClick={() => void onAttach()}
          className="mt-3 rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : `Attach selected (${selected.length})`}
        </button>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
