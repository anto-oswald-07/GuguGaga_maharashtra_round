"use client";

import Link from "next/link";
import {
  STAGE_LABELS,
  type ProjectStage,
} from "@/components/projects/constants";
import type { Project } from "@/components/projects/project-api";

type KanbanCardProps = {
  project: Project;
  pending?: boolean;
  onMove: (projectId: string, stage: ProjectStage) => void;
  stages: readonly ProjectStage[];
};

export function KanbanCard({
  project,
  pending,
  onMove,
  stages,
}: KanbanCardProps) {
  const index = stages.indexOf(project.stage);
  const prev = index > 0 ? stages[index - 1] : null;
  const next =
    index >= 0 && index < stages.length - 1 ? stages[index + 1] : null;

  return (
    <article className="rounded-md border border-[var(--border)] bg-white p-3 shadow-sm">
      <Link
        href={`/projects/${project.id}`}
        className="font-medium text-[var(--foreground)] hover:text-[var(--brand)]"
      >
        {project.title}
      </Link>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {project.assetIds.length} asset
        {project.assetIds.length === 1 ? "" : "s"}
      </p>
      <div className="mt-2 flex gap-1">
        <button
          type="button"
          title={prev ? `Move to ${STAGE_LABELS[prev]}` : undefined}
          disabled={!prev || pending}
          onClick={() => prev && onMove(project.id, prev)}
          className="flex-1 rounded border border-[var(--border)] px-1.5 py-1 text-xs disabled:opacity-30"
        >
          ←
        </button>
        <button
          type="button"
          title={next ? `Move to ${STAGE_LABELS[next]}` : undefined}
          disabled={!next || pending}
          onClick={() => next && onMove(project.id, next)}
          className="flex-1 rounded border border-[var(--border)] px-1.5 py-1 text-xs disabled:opacity-30"
        >
          →
        </button>
      </div>
    </article>
  );
}
