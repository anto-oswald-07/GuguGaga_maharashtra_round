"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  deletePack,
  generateProjectPacks,
  getPackDownload,
  listProjectPacks,
  updatePackCopy,
  updatePackStatus,
  type Job,
  type PlatformPackDto,
  type UpdatePackCopyPayload,
} from "@/lib/api";
import { JobStatusBanner } from "@/components/scripts/JobStatusBanner";
import { useJobPoll } from "@/components/scripts/useJobPoll";
import { PackCard } from "@/components/packs/PackCard";
import { PackGenerateForm } from "@/components/packs/PackGenerateForm";
import type {
  AspectRatio,
  PackStatus,
  Platform,
} from "@/components/packs/constants";

type PacksTabProps = {
  projectId: string;
  targetPlatforms?: Platform[];
};

function collectDownloadUrls(
  download: Awaited<ReturnType<typeof getPackDownload>>,
): string[] {
  const urls: string[] = [];
  if (download.zipUrl) urls.push(download.zipUrl);
  if (Array.isArray(download.urls)) {
    for (const u of download.urls) {
      if (typeof u === "string" && u) urls.push(u);
    }
  }
  if (Array.isArray(download.files)) {
    for (const f of download.files) {
      if (f?.url) urls.push(f.url);
    }
  }
  return [...new Set(urls)];
}

export function PacksTab({
  projectId,
  targetPlatforms = [],
}: PacksTabProps) {
  const [packs, setPacks] = useState<PlatformPackDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobLabel, setJobLabel] = useState("Packs job");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listProjectPacks(projectId);
      setPacks(result.items ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load packs",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const onJobTerminal = useCallback(
    async (job: Job) => {
      if (job.status === "FAILED") {
        setError(job.error || "Job failed");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const { job, error: pollError, polling } = useJobPoll(jobId, {
    onTerminal: (j) => {
      void onJobTerminal(j);
    },
  });

  async function onGenerate(
    platforms: Platform[],
    aspectRatios: AspectRatio[],
  ) {
    setError(null);
    setActionPending(true);
    setJobLabel("Generate packs");
    try {
      const result = await generateProjectPacks(projectId, {
        platforms,
        aspectRatios,
      });
      if (result.jobId) setJobId(result.jobId);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Generate packs failed",
      );
    } finally {
      setActionPending(false);
    }
  }

  async function onSaveCopy(packId: string, payload: UpdatePackCopyPayload) {
    setSavePending(true);
    setError(null);
    try {
      const updated = await updatePackCopy(packId, payload);
      setPacks((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save copy failed",
      );
    } finally {
      setSavePending(false);
    }
  }

  async function onStatusChange(packId: string, status: PackStatus) {
    setSavePending(true);
    setError(null);
    try {
      const updated = await updatePackStatus(packId, { status });
      setPacks((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Status update failed",
      );
    } finally {
      setSavePending(false);
    }
  }

  async function onDownload(packId: string) {
    setError(null);
    setActionPending(true);
    try {
      const download = await getPackDownload(packId);
      const urls = collectDownloadUrls(download);
      if (urls.length === 0) {
        setError("Download returned no URLs yet (API may still be landing).");
        return;
      }
      for (const url of urls) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Download failed",
      );
    } finally {
      setActionPending(false);
    }
  }

  async function onDelete(packId: string) {
    const pack = packs.find((p) => p.id === packId);
    const label = pack
      ? `${pack.platform} pack`
      : "this pack";
    if (
      !window.confirm(`Delete ${label}? This cannot be undone.`)
    ) {
      return;
    }
    setSavePending(true);
    setError(null);
    try {
      await deletePack(packId);
      setPacks((prev) => prev.filter((p) => p.id !== packId));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Delete pack failed",
      );
    } finally {
      setSavePending(false);
    }
  }

  const busy = actionPending || polling || savePending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Platform Packs</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Generate per-platform aspect + copy, edit title/caption/hashtags, mark
          Ready / Published, and download outputs.
        </p>
      </div>

      <JobStatusBanner
        job={job}
        polling={polling}
        error={pollError}
        label={jobLabel}
      />

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <PackGenerateForm
        defaultPlatforms={targetPlatforms}
        pending={busy}
        onGenerate={(platforms, aspects) => void onGenerate(platforms, aspects)}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Packs</h3>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void refresh()}
            className="text-sm text-[var(--brand)] hover:underline disabled:opacity-40"
          >
            Refresh
          </button>
        </div>

        {loading && packs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Loading packs…</p>
        ) : null}

        {!loading && packs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            No packs yet. Select platforms above and generate.
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {packs.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              busy={busy}
              onSaveCopy={(id, payload) => void onSaveCopy(id, payload)}
              onStatusChange={(id, status) => void onStatusChange(id, status)}
              onDownload={(id) => void onDownload(id)}
              onDelete={(id) => void onDelete(id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
