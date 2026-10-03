"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  type Platform,
} from "@/components/projects/constants";
import {
  listProjects,
  type Project,
} from "@/components/projects/project-api";
import {
  ApiError,
  postEngagement,
  type EngagementPayload,
} from "@/app/insights/insights-api";

type EngagementFormProps = {
  onSubmitted?: () => void;
};

export function EngagementForm({ onSubmitted }: EngagementFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await listProjects();
          const items = result.items ?? [];
          setProjects(items);
          setProjectId((prev) => prev || items[0]?.id || "");
        } catch {
          setProjects([]);
        }
      })();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOk(null);

    const viewsN = Number(views);
    const likesN = Number(likes);
    if (!projectId) {
      setError("Select a project.");
      return;
    }
    if (!Number.isFinite(viewsN) || viewsN < 0 || !Number.isFinite(likesN) || likesN < 0) {
      setError("Views and likes must be non-negative numbers.");
      return;
    }

    const payload: EngagementPayload = {
      projectId,
      views: Math.floor(viewsN),
      likes: Math.floor(likesN),
      ...(platform ? { platform } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    setPending(true);
    try {
      await postEngagement(payload);
      setOk("Engagement saved.");
      setViews("");
      setLikes("");
      setNotes("");
      onSubmitted?.();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save engagement",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div>
        <h3 className="text-sm font-semibold">Manual engagement</h3>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Optional post-publish views / likes for insights (FR-INT-003).
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Project</span>
        <select
          value={projectId}
          disabled={pending}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          {projects.length === 0 ? (
            <option value="">No projects</option>
          ) : (
            projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Platform (optional)</span>
        <select
          value={platform}
          disabled={pending}
          onChange={(e) => setPlatform(e.target.value as Platform | "")}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          <option value="">Any / unspecified</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Views</span>
          <input
            type="number"
            min={0}
            step={1}
            value={views}
            disabled={pending}
            onChange={(e) => setViews(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
            placeholder="1200"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Likes</span>
          <input
            type="number"
            min={0}
            step={1}
            value={likes}
            disabled={pending}
            onChange={(e) => setLikes(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
            placeholder="84"
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Notes (optional)</span>
        <input
          type="text"
          value={notes}
          disabled={pending}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          placeholder="Launch post / A/B caption"
        />
      </label>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {ok}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !projectId}
        className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save engagement"}
      </button>
    </form>
  );
}
