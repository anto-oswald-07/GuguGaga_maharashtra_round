"use client";

import { formatTimecode, type TimelineJson } from "@/lib/api";
import { useEditorStore } from "@/components/editor/editor-store";

type AiSuggestPanelProps = {
  pending?: boolean;
  onSuggest: () => void;
  onApply: () => void;
};

function proposalSummary(proposal: TimelineJson) {
  const video = proposal.tracks.find((t) => t.type === "video");
  const text = proposal.tracks.find((t) => t.type === "text");
  const clips = video && video.type === "video" ? video.clips.length : 0;
  const overlays = text && text.type === "text" ? text.items.length : 0;
  return `${clips} clip(s), ${overlays} text overlay(s), ${formatTimecode(proposal.durationMs)}`;
}

export function AiSuggestPanel({
  pending,
  onSuggest,
  onApply,
}: AiSuggestPanelProps) {
  const { state, dismissProposal } = useEditorStore();
  const proposal = state.proposal;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">AI Suggest</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Analyses project video / image / audio assets, then proposes edits.
            Never overwrites your draft until you Apply (FR-ED-006).
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={onSuggest}
          className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Suggesting…" : "Suggest timeline"}
        </button>
      </div>

      {proposal ? (
        <div className="mt-3 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-950">
            Proposal ready: {proposalSummary(proposal)}
          </p>
          {proposal.meta?.prompt ? (
            <p className="text-xs text-amber-900/80">
              Prompt: {String(proposal.meta.prompt)}
            </p>
          ) : null}
          {proposal.meta?.notes ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-amber-950/90">
              {String(proposal.meta.notes)}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onApply}
              className="rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Apply (draft + save)
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={dismissProposal}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-950 disabled:opacity-40"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">
          No pending proposal. Run Suggest to enqueue an AI timeline job.
        </p>
      )}
    </section>
  );
}
