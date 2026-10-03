import { Asset, AssetType } from "@/lib/api";

const TYPE_STYLES: Record<AssetType, string> = {
  VIDEO: "bg-sky-100 text-sky-800",
  IMAGE: "bg-emerald-100 text-emerald-800",
  AUDIO: "bg-violet-100 text-violet-800",
  DOCUMENT: "bg-amber-100 text-amber-800",
  OTHER: "bg-slate-100 text-slate-700",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

type AssetCardProps = {
  asset: Asset;
  onOpen: (asset: Asset) => void;
};

export function AssetCard({ asset, onOpen }: AssetCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(asset)}
      className="flex h-full w-full flex-col items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--brand)]"
    >
      <span
        className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[asset.type]}`}
      >
        {asset.type}
      </span>
      <span className="line-clamp-2 text-sm font-semibold text-[var(--foreground)]">
        {asset.name}
      </span>
      <span className="text-xs text-[var(--muted)]">{formatDate(asset.createdAt)}</span>
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
