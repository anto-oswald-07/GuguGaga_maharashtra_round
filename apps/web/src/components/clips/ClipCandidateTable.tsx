"use client";

import {
  formatTimecode,
  type ClipCandidateDto,
  type ClipCandidateStatus,
} from "@/lib/api";

type ClipCandidateTableProps = {
  candidates: ClipCandidateDto[];
  selectedIds: Set<string>;
  editingId?: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAllProposed: () => void;
  onEdit: (candidate: ClipCandidateDto) => void;
  onAccept: (candidate: ClipCandidateDto) => void;
  onReject: (candidate: ClipCandidateDto) => void;
  onRender: (candidate: ClipCandidateDto) => void;
  onDelete: (candidate: ClipCandidateDto) => void;
  busy?: boolean;
};

const STATUS_STYLES: Record<ClipCandidateStatus, string> = {
  proposed: "bg-slate-100 text-slate-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  rendered: "bg-sky-100 text-sky-800",
};

export function ClipCandidateTable({
  candidates,
  selectedIds,
  editingId,
  onToggleSelect,
  onToggleSelectAllProposed,
  onEdit,
  onAccept,
  onReject,
  onRender,
  onDelete,
  busy,
}: ClipCandidateTableProps) {
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No clip candidates yet. Propose clips to populate this list.
      </p>
    );
  }

  const proposed = candidates.filter((c) => c.status === "proposed");
  const allProposedSelected =
    proposed.length > 0 && proposed.every((c) => selectedIds.has(c.id));

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--background)] text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">
              <input
                type="checkbox"
                checked={allProposedSelected}
                onChange={onToggleSelectAllProposed}
                disabled={busy || proposed.length === 0}
                aria-label="Select all proposed"
                className="rounded border-[var(--border)]"
              />
            </th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Start</th>
            <th className="px-3 py-2 font-medium">End</th>
            <th className="px-3 py-2 font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((row) => {
            const selected = selectedIds.has(row.id);
            const editing = editingId === row.id;
            const canSelect = row.status === "proposed";
            const canAccept =
              row.status === "proposed" || row.status === "rejected";
            const canReject =
              row.status === "proposed" || row.status === "accepted";
            const canRender =
              row.status === "accepted" || row.status === "rendered";

            return (
              <tr
                key={row.id}
                className={`border-b border-[var(--border)] last:border-0 ${
                  editing ? "bg-teal-50" : "bg-white"
                }`}
              >
                <td className="px-3 py-2 align-top">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(row.id)}
                    disabled={busy || !canSelect}
                    aria-label={`Select ${row.title || row.id}`}
                    className="rounded border-[var(--border)]"
                  />
                </td>
                <td className="max-w-xs px-3 py-2 align-top">
                  <p className="font-medium line-clamp-2">
                    {row.title || "Untitled clip"}
                  </p>
                  {row.renderedAssetId ? (
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                      asset {row.renderedAssetId.slice(0, 8)}…
                    </p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs align-top">
                  {formatTimecode(row.startMs)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs align-top">
                  {formatTimecode(row.endMs)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top">
                  {(row.score * 100).toFixed(0)}%
                </td>
                <td className="px-3 py-2 align-top">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onEdit(row)}
                      className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs disabled:opacity-40"
                    >
                      Edit
                    </button>
                    {canAccept ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAccept(row)}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900 disabled:opacity-40"
                      >
                        Accept
                      </button>
                    ) : null}
                    {canReject ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onReject(row)}
                        className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 disabled:opacity-40"
                      >
                        Reject
                      </button>
                    ) : null}
                    {canRender ? (
                      <button
                        type="button"
                        disabled={busy || row.status === "rendered"}
                        onClick={() => onRender(row)}
                        className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-900 disabled:opacity-40"
                        title={
                          row.status === "rendered"
                            ? "Already rendered — re-render via API if needed"
                            : "Render clip"
                        }
                      >
                        {row.status === "rendered" ? "Rendered" : "Render"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(row)}
                      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
