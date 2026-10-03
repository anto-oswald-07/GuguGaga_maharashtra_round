"use client";

import type { Job } from "@/lib/api";

type JobStatusBannerProps = {
  job: Job | null;
  polling: boolean;
  error?: string | null;
  label?: string;
};

export function JobStatusBanner({
  job,
  polling,
  error,
  label = "Generation job",
}: JobStatusBannerProps) {
  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {error}
      </p>
    );
  }

  if (!job && !polling) return null;

  const status = job?.status ?? "QUEUED";
  const progress = job?.progress ?? 0;
  const tone =
    status === "FAILED"
      ? "bg-red-50 text-red-800"
      : status === "SUCCEEDED"
        ? "bg-emerald-50 text-emerald-800"
        : "bg-amber-50 text-amber-900";

  return (
    <div className={`rounded-md px-3 py-2 text-sm ${tone}`} role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {label}: {status}
          {polling && status !== "SUCCEEDED" && status !== "FAILED"
            ? " (polling…)"
            : ""}
        </span>
        <span className="text-xs opacity-80">{progress}%</span>
      </div>
      {job?.error ? (
        <p className="mt-1 text-xs">{job.error}</p>
      ) : null}
      {job?.id ? (
        <p className="mt-1 font-mono text-[10px] opacity-70">{job.id}</p>
      ) : null}
    </div>
  );
}
