"use client";

import {
  PROJECT_STAGES,
  STAGE_LABELS,
  type ProjectStage,
} from "@/components/projects/constants";

type StageControlsProps = {
  stage: ProjectStage;
  pending?: boolean;
  onMove: (stage: ProjectStage) => void;
};

export function StageControls({ stage, pending, onMove }: StageControlsProps) {
  const index = PROJECT_STAGES.indexOf(stage);
  const prev = index > 0 ? PROJECT_STAGES[index - 1] : null;
  const next =
    index >= 0 && index < PROJECT_STAGES.length - 1
      ? PROJECT_STAGES[index + 1]
      : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Current stage</span>
        <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-sm font-medium text-teal-800">
          {STAGE_LABELS[stage]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!prev || pending}
          onClick={() => prev && onMove(prev)}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
        >
          ← {prev ? STAGE_LABELS[prev] : "—"}
        </button>
        <button
          type="button"
          disabled={!next || pending}
          onClick={() => next && onMove(next)}
          className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {next ? STAGE_LABELS[next] : "—"} →
        </button>
      </div>

      <label className="block max-w-xs space-y-1 text-sm">
        <span className="font-medium">Jump to stage</span>
        <select
          value={stage}
          disabled={pending}
          onChange={(e) => onMove(e.target.value as ProjectStage)}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          {PROJECT_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
