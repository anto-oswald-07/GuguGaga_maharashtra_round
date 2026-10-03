"use client";

import {
  formatTimecode,
  isLowConfidence,
  LOW_CONFIDENCE_THRESHOLD,
  type ScriptFootageMapDto,
} from "@/lib/api";

type MappingTableProps = {
  mappings: ScriptFootageMapDto[];
  selectedId?: string | null;
  onEdit: (mapping: ScriptFootageMapDto) => void;
};

export function MappingTable({
  mappings,
  selectedId,
  onEdit,
}: MappingTableProps) {
  if (mappings.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No mappings yet. Align a script to a transcript to populate this table.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--background)] text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Script section</th>
            <th className="px-3 py-2 font-medium">Start</th>
            <th className="px-3 py-2 font-medium">End</th>
            <th className="px-3 py-2 font-medium">Confidence</th>
            <th className="px-3 py-2 font-medium"> </th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((row) => {
            const low = isLowConfidence(row.confidence);
            const selected = selectedId === row.id;
            return (
              <tr
                key={row.id}
                className={`border-b border-[var(--border)] last:border-0 ${
                  low
                    ? "bg-amber-50"
                    : selected
                      ? "bg-teal-50"
                      : "bg-white"
                }`}
                title={
                  low
                    ? `Low confidence (< ${LOW_CONFIDENCE_THRESHOLD})`
                    : undefined
                }
              >
                <td className="max-w-xs px-3 py-2 align-top">
                  <p className="line-clamp-3 whitespace-pre-wrap">
                    {row.scriptRef || "—"}
                  </p>
                  {low ? (
                    <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      Low confidence
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs align-top">
                  {formatTimecode(row.startMs)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs align-top">
                  {formatTimecode(row.endMs)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top">
                  <span
                    className={
                      low ? "font-semibold text-amber-900" : "text-[var(--foreground)]"
                    }
                  >
                    {(row.confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-3 py-2 align-top">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs hover:bg-[var(--background)]"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
