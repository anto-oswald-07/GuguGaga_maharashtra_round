"use client";

import Link from "next/link";
import {
  PLATFORM_LABELS,
  STAGE_LABELS,
  type Platform,
  type ProjectStage,
} from "@/components/projects/constants";
import type { Project } from "@/components/projects/project-api";

type ProjectListItemProps = {
  project: Project;
  deleting?: boolean;
  onDelete?: (project: Project) => void;
};

function platformLabel(platform: Platform) {
  return PLATFORM_LABELS[platform] ?? platform;
}

function stageLabel(stage: ProjectStage) {
  return STAGE_LABELS[stage] ?? stage;
}

export function ProjectListItem({
  project,
  deleting,
  onDelete,
}: ProjectListItemProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--brand)]/50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link
          href={`/projects/${project.id}`}
          className="font-semibold tracking-tight text-[var(--foreground)] hover:text-[var(--brand)]"
        >
          {project.title}
        </Link>
        <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
          {stageLabel(project.stage)}
        </span>
      </div>
      {project.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
          {project.description}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        {project.targetPlatforms.length > 0 ? (
          project.targetPlatforms.map((p) => (
            <span
              key={p}
              className="rounded border border-[var(--border)] bg-white px-2 py-0.5"
            >
              {platformLabel(p)}
            </span>
          ))
        ) : (
          <span>No platforms</span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-[var(--foreground)]">
          📁 {project.assetIds?.length ?? 0} asset
          {(project.assetIds?.length ?? 0) === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/projects/${project.id}`}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:border-[var(--brand)]"
        >
          Open
        </Link>
        {onDelete ? (
          <button
            type="button"
            disabled={deleting}
            onClick={() => onDelete(project)}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 hover:border-red-300 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
