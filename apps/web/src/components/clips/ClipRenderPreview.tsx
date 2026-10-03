"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAsset, type Asset, type ClipCandidateDto } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

type ClipRenderPreviewProps = {
  candidate: ClipCandidateDto | null;
};

export function ClipRenderPreview({ candidate }: ClipRenderPreviewProps) {
  const assetId = candidate?.renderedAssetId ?? null;
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
              err instanceof Error ? err.message : "Failed to load rendered asset",
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

  if (!candidate) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Select a rendered candidate to preview the output asset.
      </p>
    );
  }

  if (!assetId) {
    return (
      <p className="text-sm text-[var(--muted)]">
        “{candidate.title || "Untitled"}” is not rendered yet. Accept and render
        to create a clip asset.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{asset?.name ?? "Rendered clip"}</p>
          <p className="font-mono text-[10px] text-[var(--muted)]">{assetId}</p>
        </div>
        <Link
          href="/assets"
          className="text-sm text-[var(--brand)] hover:underline"
        >
          Open asset library →
        </Link>
      </div>

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
          Preview unavailable — asset link above still works once API serves
          /content.
        </div>
      )}
    </div>
  );
}
