"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasToken } from "@/lib/auth-storage";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import { ProjectListItem } from "@/components/projects/ProjectListItem";
import {
  PROJECT_STAGES,
  STAGE_LABELS,
  type ProjectStage,
} from "@/components/projects/constants";
import {
  ApiError,
  listProjects,
  type Project,
} from "@/components/projects/project-api";

export function ProjectList() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stage, setStage] = useState<ProjectStage | "">("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    const t = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(t);
  }, [router]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(handle);
  }, [q]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listProjects({
        stage: stage || undefined,
        q: debouncedQ || undefined,
      });
      setProjects(result.items ?? []);
    } catch (err) {
      setProjects([]);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load projects",
      );
    } finally {
      setLoading(false);
    }
  }, [stage, debouncedQ]);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [ready, refresh]);

  if (!ready) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-[var(--muted)]">Checking session…</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create projects, set platforms, and open a hub to move stages.
        </p>
      </div>

      <ProjectCreateForm onCreated={refresh} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Stage</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as ProjectStage | "")}
            className="block rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="">All stages</option>
            {PROJECT_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
          <span className="font-medium">Search</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by title…"
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading projects…</p>
      ) : null}

      {!loading && projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
          <p className="font-medium text-[var(--foreground)]">No projects yet</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Create one above to start the workflow.
          </p>
        </div>
      ) : null}

      {projects.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <ProjectListItem key={project.id} project={project} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
