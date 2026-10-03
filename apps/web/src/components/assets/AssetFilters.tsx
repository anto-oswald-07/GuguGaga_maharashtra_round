"use client";

import { AssetType } from "@/lib/api";

type AssetFiltersProps = {
  type: AssetType | "";
  q: string;
  onTypeChange: (type: AssetType | "") => void;
  onQueryChange: (q: string) => void;
};

const TYPE_OPTIONS: Array<{ value: AssetType | ""; label: string }> = [
  { value: "", label: "All types" },
  { value: "VIDEO", label: "Video" },
  { value: "IMAGE", label: "Image" },
  { value: "AUDIO", label: "Audio" },
  { value: "DOCUMENT", label: "Document" },
  { value: "OTHER", label: "Other" },
];

export function AssetFilters({
  type,
  q,
  onTypeChange,
  onQueryChange,
}: AssetFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">
        <span className="font-medium">Type</span>
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value as AssetType | "")}
          className="block rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--brand)]"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-[220px] flex-1 space-y-1 text-sm">
        <span className="font-medium">Search by name</span>
        <input
          type="search"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find assets…"
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--brand)]"
        />
      </label>
    </div>
  );
}
