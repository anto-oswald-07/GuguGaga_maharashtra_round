"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  listAssets,
  listProjectScripts,
  type Asset,
  type Job,
  type ScriptDocument,
} from "@/lib/api";
import { JobStatusBanner } from "@/components/scripts/JobStatusBanner";
import { useJobPoll } from "@/components/scripts/useJobPoll";
import { SceneFulfillmentPanel } from "@/components/mapping/SceneFulfillmentPanel";

type MappingTabProps = {
  projectId: string;
  assetIds: string[];
  onAssetsChanged?: () => void;
};

export function MappingTab({
  projectId,
  assetIds,
  onAssetsChanged,
}: MappingTabProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [scripts, setScripts] = useState<ScriptDocument[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobLabel, setJobLabel] = useState("Scene job");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetResult, scriptResult] = await Promise.all([
        listAssets(),
        listProjectScripts(projectId),
      ]);

      const allAssets = assetResult.items ?? [];
      setAssets(allAssets);
      setScripts(scriptResult.items ?? []);

      setSelectedScriptId((prev) => {
        const items = scriptResult.items ?? [];
        if (prev && items.some((s) => s.id === prev)) return prev;
        return items[0]?.id ?? "";
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load scenes and footage",
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

  async function startJob(
    label: string,
    runner: () => Promise<{ jobId: string }>,
  ) {
    setError(null);
    setActionPending(true);
    setJobLabel(label);
    try {
      const result = await runner();
      if (result.jobId) setJobId(result.jobId);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : `${label} failed`,
      );
    } finally {
      setActionPending(false);
    }
  }

  const busy = actionPending || polling;

  const activeScript = useMemo(
    () => scripts.find((s) => s.id === selectedScriptId) ?? scripts[0] ?? null,
    [scripts, selectedScriptId],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Scenes &amp; Footage
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Fill each script scene with footage, customize AI clip prompts, and review coverage. To auto-trim long footage into scenes, use the Auto-Trim Clips tab.
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--foreground)]">
          {assetIds?.length ?? 0} attached asset
          {(assetIds?.length ?? 0) === 1 ? "" : "s"}
        </span>
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

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading scenes and footage…</p>
      ) : null}

      {scripts.length > 1 ? (
        <label className="block max-w-md space-y-1 text-sm">
          <span className="font-medium">Script</span>
          <select
            value={selectedScriptId}
            onChange={(e) => setSelectedScriptId(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.topic || s.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <SceneFulfillmentPanel
        projectId={projectId}
        script={activeScript}
        assets={assets}
        busy={busy}
        onBusyChange={setActionPending}
        onStartJob={startJob}
        onError={setError}
        onRefreshed={refresh}
        onAssetsAttached={onAssetsChanged}
      />
    </div>
  );
}
