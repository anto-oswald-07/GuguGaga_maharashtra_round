"use client";

import { STAGE_LABELS, type ProjectStage } from "@/components/projects/constants";
import type { Project } from "@/components/projects/project-api";
import { KanbanCard } from "@/components/workflow/KanbanCard";

type KanbanColumnProps = {
  stage: ProjectStage;
  projects: Project[];
  pendingId: string | null;
  onMove: (projectId: string, stage: ProjectStage) => void;
  onDelete?: (project: Project) => void;
  stages: readonly ProjectStage[];
};

export function KanbanColumn({
  stage,
  projects,
  pendingId,
  onMove,
  onDelete,
  stages,
}: KanbanColumnProps) {
  return (
    <div className="flex w-64 shrink-0 flex-col self-stretch overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:w-72">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--brand-soft)]/35 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            {STAGE_LABELS[stage]}
          </h2>
          <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-xs tabular-nums text-[var(--muted)]">
            {projects.length}
          </span>
        </div>
      </header>
      <div className="workflow-column-body flex flex-1 flex-col gap-3 overflow-y-auto p-3.5 sm:p-4">
        {projects.length === 0 ? (
          <p className="gg-empty flex flex-1 items-center justify-center rounded-lg px-3 py-12 text-center text-sm text-[var(--muted)]">
            Empty
          </p>
        ) : (
          projects.map((project) => (
            <KanbanCard
              key={project.id}
              project={project}
              pending={pendingId === project.id}
              onMove={onMove}
              onDelete={onDelete}
              stages={stages}
            />
          ))
        )}
      </div>
    </div>
  );
}
