"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasToken } from "@/lib/auth-storage";
import { ApiError, listJobs, type Job } from "@/lib/api";
import { retryJob } from "@/app/insights/insights-api";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(status: Job["status"]) {
  switch (status) {
    case "FAILED":
      return "bg-red-50 text-red-800";
    case "SUCCEEDED":
      return "bg-emerald-50 text-emerald-800";
    case "RUNNING":
      return "bg-amber-50 text-amber-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function JobsCenter() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

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
      const result = await listJobs();
      setJobs(result.items ?? []);
    } catch (err) {
      setJobs([]);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load jobs",
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

  async function onRetry(job: Job) {
    setRetryingId(job.id);
    setError(null);
    try {
      await retryJob(job.id);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Retry failed",
      );
    } finally {
      setRetryingId(null);
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
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Background work for this workspace — retry failed jobs.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || retryingId !== null}
          onClick={() => void refresh()}
          className="text-sm text-[var(--brand)] hover:underline disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading && jobs.length === 0 ? (
        <p className="gg-loading text-sm text-[var(--muted)]">
          <span className="gg-spinner" aria-hidden />
          Loading jobs…
        </p>
      ) : null}

      {!loading && jobs.length === 0 ? (
        <div className="gg-empty rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
          <p className="font-medium text-[var(--foreground)]">No jobs yet</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Generate a script, transcribe, propose clips, or render a timeline to
            enqueue work.
          </p>
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--background)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Progress</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2 font-medium">Error</th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{job.type}</div>
                    <div className="font-mono text-[10px] text-[var(--muted)]">
                      {job.id}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusTone(job.status)}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums">
                    {job.progress ?? 0}%
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-[var(--muted)]">
                    {formatDate(job.updatedAt || job.createdAt)}
                  </td>
                  <td className="max-w-[14rem] px-3 py-2 align-top text-xs text-red-700">
                    {job.error || "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {job.status === "FAILED" ? (
                      <button
                        type="button"
                        disabled={retryingId !== null}
                        onClick={() => void onRetry(job)}
                        className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium disabled:opacity-40"
                      >
                        {retryingId === job.id ? "Retrying…" : "Retry"}
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
