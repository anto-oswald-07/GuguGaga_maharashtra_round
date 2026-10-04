"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  deletePack,
  downloadAssetFile,
  downloadPackFile,
  downloadTextFile,
  generateProjectPacks,
  getPackDownload,
  listProjectPacks,
  listProjectTimelines,
  updatePackCopy,
  updatePackStatus,
  type Job,
  type PlatformPackDto,
  type TimelineDocument,
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

export function PacksTab({
  projectId,
  targetPlatforms = [],
}: PacksTabProps) {
  const [packs, setPacks] = useState<PlatformPackDto[]>([]);
  const [timelines, setTimelines] = useState<TimelineDocument[]>([]);
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
      const [packResult, timelineResult] = await Promise.all([
        listProjectPacks(projectId),
        listProjectTimelines(projectId).catch(() => ({ items: [] })),
      ]);
      setPacks(packResult.items ?? []);
      setTimelines(timelineResult.items ?? []);
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
    const activeTimeline = timelines[0] ?? null;
    try {
      const result = await generateProjectPacks(projectId, {
        platforms,
        aspectRatios,
        timelineId: activeTimeline?.id,
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

  async function onDownloadVideo(packId: string) {
    setError(null);
    setActionPending(true);
    const pack = packs.find((p) => p.id === packId);
    try {
      await downloadPackFile(
        packId,
        `pack-${(pack?.platform ?? "video").toLowerCase()}.mp4`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Download failed. Please ensure the pack has been generated.",
      );
    } finally {
      setActionPending(false);
    }
  }

  function onDownloadCopy(packId: string) {
    const pack = packs.find((p) => p.id === packId);
    if (!pack) return;
    const copyContent = [
      `Platform: ${pack.platform}`,
      `Aspect Ratio: ${pack.aspectRatio}`,
      `Status: ${pack.status}`,
      "",
      `Title:\n${pack.title || "—"}`,
      "",
      `Caption:\n${pack.caption || "—"}`,
      "",
      `Hashtags:\n${pack.hashtags.join(" ") || "—"}`,
    ].join("\n");
    downloadTextFile(
      `pack-${pack.platform.toLowerCase()}-copy.txt`,
      copyContent,
    );
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-slate-50 px-3.5 py-2.5 text-xs text-[var(--muted)]">
        <div>
          <span>
            🎬 Source sequence:{" "}
            <strong className="text-[var(--foreground)]">
              {timelines.length > 0 ? "Saved Edit Page Timeline" : "Project Footage"}
            </strong>
          </span>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            Renders what is saved on the edit page directly into platform resolutions (TikTok/Reels 9:16, YouTube 16:9, LinkedIn 1:1).
          </p>
        </div>
        {timelines.length > 0 ? (
          <span className="rounded bg-teal-50 px-2 py-0.5 font-medium text-teal-800">
            Edit Timeline Active
          </span>
        ) : null}
      </div>

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
              onDownload={(id) => void onDownloadVideo(id)}
              onDownloadCopy={(id) => void onDownloadCopy(id)}
              onDelete={(id) => void onDelete(id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
