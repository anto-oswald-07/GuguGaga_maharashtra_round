"use client";

import {
  formatTimecode,
  type TranscriptSegmentDto,
} from "@/lib/api";

type TranscriptSegmentListProps = {
  segments: TranscriptSegmentDto[];
  selectedIndex?: number | null;
  onSelect?: (segment: TranscriptSegmentDto, index: number) => void;
};

export function TranscriptSegmentList({
  segments,
  selectedIndex,
  onSelect,
}: TranscriptSegmentListProps) {
  if (segments.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No transcript segments yet. Transcribe footage to populate this list.
      </p>
    );
  }

  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] bg-white p-2">
      {segments.map((segment, index) => {
        const active = selectedIndex === index;
        return (
          <li key={segment.id ?? `${segment.startMs}-${index}`}>
            <button
              type="button"
              onClick={() => onSelect?.(segment, index)}
              className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                active
                  ? "bg-teal-50 text-teal-900"
                  : "hover:bg-[var(--background)]"
              }`}
            >
              <span className="font-mono text-xs text-[var(--muted)]">
                {formatTimecode(segment.startMs)} –{" "}
                {formatTimecode(segment.endMs)}
              </span>
              <p className="mt-0.5 line-clamp-2">{segment.text || "—"}</p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
