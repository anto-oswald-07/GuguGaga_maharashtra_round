"use client";

import { STAGE_LABELS, type ProjectStage } from "@/components/projects/constants";
import type { Project } from "@/components/projects/project-api";
import { KanbanCard } from "@/components/workflow/KanbanCard";

type KanbanColumnProps = {
  stage: ProjectStage;
  projects: Project[];
  pendingId: string | null;
  onMove: (projectId: string, stage: ProjectStage) => void;
  stages: readonly ProjectStage[];
};

export function KanbanColumn({
  stage,
  projects,
  pendingId,
  onMove,
  stages,
}: KanbanColumnProps) {
  return (
    <div className="flex w-56 shrink-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-3 py-2">
        <h2 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
        <p className="text-xs text-[var(--muted)]">
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>
      </header>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {projects.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-[var(--muted)]">
            Empty
          </p>
        ) : (
          projects.map((project) => (
            <KanbanCard
              key={project.id}
              project={project}
              pending={pendingId === project.id}
              onMove={onMove}
              stages={stages}
            />
          ))
        )}
      </div>
    </div>
  );
}
