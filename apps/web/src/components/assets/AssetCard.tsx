import { Asset, AssetType } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import { useEffect, useState } from "react";

const TYPE_STYLES: Record<AssetType, string> = {
  VIDEO: "bg-sky-100 text-sky-800",
  IMAGE: "bg-emerald-100 text-emerald-800",
  AUDIO: "bg-violet-100 text-violet-800",
  DOCUMENT: "bg-amber-100 text-amber-800",
  OTHER: "bg-slate-100 text-slate-700",
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function hasThumbnail(asset: Asset): boolean {
  const path = asset.metadata?.thumbnailPath;
  return typeof path === "string" && path.length > 0;
}

type AssetCardProps = {
  asset: Asset;
  onOpen: (asset: Asset) => void;
};

export function AssetCard({ asset, onOpen }: AssetCardProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (asset.type !== "VIDEO" || !hasThumbnail(asset)) {
      setThumbUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    const token = getToken();

    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/assets/${asset.id}/thumbnail`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbUrl(objectUrl);
      } catch {
        // Keep CSS placeholder
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset]);

  const width = asset.metadata?.width;
  const height = asset.metadata?.height;
  const dims =
    typeof width === "number" && typeof height === "number"
      ? `${width}×${height}`
      : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(asset)}
      className="flex h-full w-full flex-col items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--brand)]"
    >
      {asset.type === "VIDEO" ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-slate-200">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-600">
              Video placeholder
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition">
            <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white shadow">
              ▶ Play Clip
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between w-full">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[asset.type]}`}
        >
          {asset.type}
        </span>
        <span className="text-xs font-medium text-[var(--brand)]">
          ▶ View
        </span>
      </div>
      <span className="line-clamp-2 text-sm font-semibold text-[var(--foreground)]">
        {asset.name}
      </span>
      <span className="text-xs text-[var(--muted)]">{formatDate(asset.createdAt)}</span>
      {dims ? (
        <span className="text-xs text-[var(--muted)]">{dims}</span>
      ) : null}
      {asset.tags?.length ? (
        <div className="mt-auto flex flex-wrap gap-1">
          {asset.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded bg-[var(--background)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]"
            >
              {tag}
            </span>
          ))}
          {asset.tags.length > 4 ? (
            <span className="text-[11px] text-[var(--muted)]">
              +{asset.tags.length - 4}
            </span>
          ) : null}
        </div>
      ) : (
        <span className="mt-auto text-xs text-[var(--muted)]">No tags</span>
      )}
    </button>
  );
}
