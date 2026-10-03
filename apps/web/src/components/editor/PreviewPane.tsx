"use client";

import { useEffect, useState } from "react";
import { getAsset, type Asset } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import { useEditorStore } from "@/components/editor/editor-store";
import { JobStatusBanner } from "@/components/scripts/JobStatusBanner";
import type { Job } from "@/lib/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

type PreviewPaneProps = {
  job: Job | null;
  polling: boolean;
  pollError?: string | null;
  jobLabel?: string;
};

export function PreviewPane({
  job,
  polling,
  pollError,
  jobLabel = "Render job",
}: PreviewPaneProps) {
  const { state } = useEditorStore();
  const assetId = state.previewAssetId;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) {
      const clear = window.setTimeout(() => {
        setAsset(null);
        setVideoUrl(null);
        setError(null);
      }, 0);
      return () => window.clearTimeout(clear);
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const token = getToken();

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await getAsset(assetId);
          if (cancelled) return;
          setAsset(next);
          setError(null);

          const res = await fetch(`${API_BASE_URL}/assets/${assetId}/content`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) {
            if (!cancelled) setVideoUrl(null);
            return;
          }
          const blob = await res.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setVideoUrl(objectUrl);
        } catch (err) {
          if (!cancelled) {
            setAsset(null);
            setVideoUrl(null);
            setError(
              err instanceof Error ? err.message : "Failed to load preview",
            );
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  return (
    <section className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-3 py-2">
        <h2 className="text-sm font-semibold">Preview</h2>
        <p className="text-xs text-[var(--muted)]">
          Rendered timeline output
          {asset ? ` · ${asset.name}` : ""}
        </p>
      </div>
      <div className="space-y-3 p-3">
        <JobStatusBanner
          job={job}
          polling={polling}
          error={pollError}
          label={jobLabel}
        />
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            className="aspect-video w-full rounded-md border border-[var(--border)] bg-black"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] text-sm text-[var(--muted)]">
            {assetId
              ? "Preview loading or /content unavailable…"
              : "Render the timeline to see a preview here."}
          </div>
        )}
      </div>
    </section>
  );
}
