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
  onDelete?: (project: Project) => void;
  stages: readonly ProjectStage[];
};

export function KanbanCard({
  project,
  pending,
  onMove,
  onDelete,
  stages,
}: KanbanCardProps) {
  const index = stages.indexOf(project.stage);
  const prev = index > 0 ? stages[index - 1] : null;
  const next =
    index >= 0 && index < stages.length - 1 ? stages[index + 1] : null;

  return (
    <article
      className={`rounded-lg border border-[var(--border)] bg-white p-4 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <Link
        href={`/projects/${project.id}`}
        className="line-clamp-2 text-sm font-medium leading-snug text-[var(--foreground)] hover:text-[var(--brand)]"
      >
        {project.title}
      </Link>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {project.assetIds.length} asset
        {project.assetIds.length === 1 ? "" : "s"}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          title={prev ? `Move to ${STAGE_LABELS[prev]}` : undefined}
          disabled={!prev || pending}
          onClick={() => prev && onMove(project.id, prev)}
          className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--brand)] hover:text-[var(--foreground)] disabled:cursor-default disabled:opacity-30"
        >
          ←
        </button>
        <button
          type="button"
          title={next ? `Move to ${STAGE_LABELS[next]}` : undefined}
          disabled={!next || pending}
          onClick={() => next && onMove(project.id, next)}
          className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--brand)] hover:text-[var(--foreground)] disabled:cursor-default disabled:opacity-30"
        >
          →
        </button>
      </div>
      {onDelete ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onDelete(project)}
          className="mt-2 w-full rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 disabled:opacity-40"
        >
          Delete
        </button>
      ) : null}
    </article>
  );
}
