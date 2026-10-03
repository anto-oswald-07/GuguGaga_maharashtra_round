"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasToken } from "@/lib/auth-storage";
import {
  PROJECT_STAGES,
  type ProjectStage,
} from "@/components/projects/constants";
import {
  ApiError,
  deleteProject,
  listProjects,
  transitionProjectStage,
  type Project,
} from "@/components/projects/project-api";
import { KanbanColumn } from "@/components/workflow/KanbanColumn";

export function KanbanBoard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    const t = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(t);
  }, [router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listProjects();
      setProjects(result.items ?? []);
    } catch (err) {
      setProjects([]);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load workflow",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [ready, refresh]);

  const byStage = useMemo(() => {
    const map = new Map<ProjectStage, Project[]>();
    for (const stage of PROJECT_STAGES) map.set(stage, []);
    for (const project of projects) {
      const list = map.get(project.stage);
      if (list) list.push(project);
      else map.set(project.stage, [project]);
    }
    return map;
  }, [projects]);

  async function onMove(projectId: string, stage: ProjectStage) {
    setPendingId(projectId);
    setError(null);
    try {
      const updated = await transitionProjectStage(projectId, stage);
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Move failed",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function onDelete(project: Project) {
    if (
      !window.confirm(
        `Delete project “${project.title}”? This hides it from the workspace.`,
      )
    ) {
      return;
    }
    setPendingId(project.id);
    setError(null);
    try {
      await deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Delete failed",
      );
    } finally {
      setPendingId(null);
    }
  }

  if (!ready) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="gg-loading text-[var(--muted)]">
          <span className="gg-spinner" aria-hidden />
          Checking session…
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflow</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Kanban by project stage. Use ← → on cards to move (MVP).
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => void refresh()}
            className="text-sm text-[var(--brand)] hover:underline disabled:opacity-40"
          >
            Refresh
          </button>
          <Link
            href="/projects"
            className="text-sm font-medium text-[var(--brand)] hover:underline"
          >
            Manage projects
          </Link>
        </div>
      </div>

      {error ? (
        <p
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {loading && projects.length === 0 ? (
        <p className="gg-loading text-sm text-[var(--muted)]">
          <span className="gg-spinner" aria-hidden />
          Loading board…
        </p>
      ) : (
        <div className="workflow-board overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_65%,var(--background))]">
          <div className="workflow-board-scroll overflow-x-auto">
            <div className="flex min-h-[34rem] w-max items-stretch gap-5 p-5 sm:gap-6 sm:p-6">
              {PROJECT_STAGES.map((stage) => (
                <KanbanColumn
                  key={stage}
                  stage={stage}
                  projects={byStage.get(stage) ?? []}
                  pendingId={pendingId}
                  onMove={(id, next) => void onMove(id, next)}
                  onDelete={(p) => void onDelete(p)}
                  stages={PROJECT_STAGES}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
