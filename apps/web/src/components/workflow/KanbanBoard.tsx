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

  if (!ready) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-[var(--muted)]">Checking session…</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Workflow</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Kanban by project stage. Use ← → on cards to move (MVP).
            </p>
          </div>
          <Link
            href="/projects"
            className="text-sm font-medium text-[var(--brand)] hover:underline"
          >
            Manage projects
          </Link>
        </div>

        {error ? (
          <p
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Loading board…</p>
        ) : null}
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="mx-auto flex min-w-max gap-3 px-4">
          {PROJECT_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              projects={byStage.get(stage) ?? []}
              pendingId={pendingId}
              onMove={(id, next) => void onMove(id, next)}
              stages={PROJECT_STAGES}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
