"use client";

import type { ScriptVersion } from "@/lib/api";

type ScriptVersionListProps = {
  versions: ScriptVersion[];
  activeVersionId?: string | null;
  onSelect?: (version: ScriptVersion) => void;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function ScriptVersionList({
  versions,
  activeVersionId,
  onSelect,
}: ScriptVersionListProps) {
  const sorted = [...versions].sort((a, b) => b.version - a.version);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">No versions saved yet.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {sorted.map((version) => {
        const active = version.id === activeVersionId;
        return (
          <li key={version.id}>
            <button
              type="button"
              onClick={() => onSelect?.(version)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? "border-[var(--brand)] bg-teal-50"
                  : "border-[var(--border)] bg-white hover:border-[var(--brand)]/40"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">Version {version.version}</span>
                <span className="text-xs text-[var(--muted)]">
                  {formatDate(version.createdAt)}
                </span>
              </div>
              {version.source ? (
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Source: {version.source}
                </p>
              ) : null}
              <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                {version.content.hook}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
