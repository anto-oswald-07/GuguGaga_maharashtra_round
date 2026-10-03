"use client";

import type { Asset } from "@/lib/api";
import { formatTimecode } from "@/lib/api";

type MediaBinProps = {
  assets: Asset[];
  loading?: boolean;
};

export function MediaBin({ assets, loading }: MediaBinProps) {
  return (
    <aside className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-3 py-2">
        <h2 className="text-sm font-semibold">Bin</h2>
        <p className="text-xs text-[var(--muted)]">Project media</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="px-1 text-xs text-[var(--muted)]">Loading…</p>
        ) : assets.length === 0 ? (
          <p className="px-1 text-xs text-[var(--muted)]">
            No VIDEO assets attached. Attach footage on the project Overview.
          </p>
        ) : (
          <ul className="space-y-1">
            {assets.map((asset) => {
              const duration =
                typeof asset.metadata?.durationMs === "number"
                  ? asset.metadata.durationMs
                  : typeof asset.metadata?.durationSec === "number"
                    ? Number(asset.metadata.durationSec) * 1000
                    : null;
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
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
