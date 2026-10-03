"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasToken } from "@/lib/auth-storage";
import { AttachAssetsPanel } from "@/components/projects/AttachAssetsPanel";
import { StageControls } from "@/components/projects/StageControls";
import {
  PLATFORM_LABELS,
  type Platform,
  type ProjectStage,
} from "@/components/projects/constants";
import {
  ApiError,
  getProject,
  getProjectStageHistory,
  transitionProjectStage,
  type Project,
  type StageEvent,
} from "@/components/projects/project-api";
import { ClipsTab } from "@/components/clips/ClipsTab";
import { MappingTab } from "@/components/mapping/MappingTab";
import { ScriptTab } from "@/components/scripts/ScriptTab";
import type { ScriptPlatform } from "@/lib/api";

type ProjectDetailProps = {
  projectId: string;
};

type HubTab = "overview" | "script" | "mapping" | "clips";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function ProjectDetail({ projectId }: ProjectDetailProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<StageEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stagePending, setStagePending] = useState(false);
  const [tab, setTab] = useState<HubTab>("overview");

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
      const [proj, hist] = await Promise.all([
        getProject(projectId),
        getProjectStageHistory(projectId),
      ]);
      setProject(proj);
      setHistory(hist.items ?? []);
    } catch (err) {
      setProject(null);
      setHistory([]);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load project",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [ready, refresh]);

  async function onMoveStage(stage: ProjectStage) {
    if (!project || stage === project.stage) return;
    setStagePending(true);
    setError(null);
    try {
      const updated = await transitionProjectStage(project.id, stage);
      setProject(updated);
      const hist = await getProjectStageHistory(project.id);
      setHistory(hist.items ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Stage move failed",
      );
    } finally {
      setStagePending(false);
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
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/projects" className="text-[var(--brand)] hover:underline">
          ← Projects
        </Link>
        <Link href="/workflow" className="text-[var(--muted)] hover:underline">
          Workflow board
        </Link>
      </div>

      {loading && !project ? (
        <p className="text-sm text-[var(--muted)]">Loading project…</p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {project ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.title}
            </h1>
            {project.description ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
                {project.description}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              {project.targetPlatforms.length > 0 ? (
                project.targetPlatforms.map((p: Platform) => (
                  <span
                    key={p}
                    className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5"
                  >
                    {PLATFORM_LABELS[p] ?? p}
                  </span>
                ))
              ) : (
                <span>No platforms set</span>
              )}
            </div>
          </div>

          <div className="border-b border-[var(--border)]">
            <nav className="-mb-px flex gap-4 text-sm">
              <button
                type="button"
                onClick={() => setTab("overview")}
                className={
                  tab === "overview"
                    ? "border-b-2 border-[var(--brand)] px-1 py-2 font-medium text-[var(--brand)]"
                    : "px-1 py-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                }
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setTab("script")}
                className={
                  tab === "script"
                    ? "border-b-2 border-[var(--brand)] px-1 py-2 font-medium text-[var(--brand)]"
                    : "px-1 py-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                }
              >
                Script
              </button>
              <button
                type="button"
                onClick={() => setTab("mapping")}
                className={
                  tab === "mapping"
                    ? "border-b-2 border-[var(--brand)] px-1 py-2 font-medium text-[var(--brand)]"
                    : "px-1 py-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                }
              >
                Footage &amp; Mapping
              </button>
              <button
                type="button"
                onClick={() => setTab("clips")}
                className={
                  tab === "clips"
                    ? "border-b-2 border-[var(--brand)] px-1 py-2 font-medium text-[var(--brand)]"
                    : "px-1 py-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                }
              >
                Clips
              </button>
              <Link
                href={`/projects/${project.id}/editor`}
                className="px-1 py-2 text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Editor
              </Link>
            </nav>
          </div>

          {tab === "overview" ? (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                  <h2 className="text-sm font-semibold">Stage</h2>
                  <StageControls
                    stage={project.stage}
                    pending={stagePending}
                    onMove={(s) => void onMoveStage(s)}
                  />
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                  <AttachAssetsPanel
                    project={project}
                    onChanged={(next) => setProject(next)}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <h2 className="text-sm font-semibold">Stage history</h2>
                {history.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">No events yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {history.map((event) => (
                      <li
                        key={event.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2 last:border-0"
                      >
                        <span>
                          {event.fromStage ?? "—"} →{" "}
                          <span className="font-medium">{event.toStage}</span>
                        </span>
                        <span className="text-xs text-[var(--muted)]">
                          {formatDate(event.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : tab === "script" ? (
            <ScriptTab
              projectId={project.id}
              defaultPlatform={
                (project.targetPlatforms[0] as ScriptPlatform | undefined) ??
                null
              }
            />
          ) : tab === "mapping" ? (
            <MappingTab
              projectId={project.id}
              assetIds={project.assetIds}
            />
          ) : (
            <ClipsTab projectId={project.id} assetIds={project.assetIds} />
          )}
        </>
      ) : null}
    </section>
  );
}
