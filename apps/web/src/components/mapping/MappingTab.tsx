"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  alignProjectScript,
  formatTimecode,
  listAssets,
  listProjectMappings,
  listProjectScripts,
  listProjectTranscripts,
  transcribeProjectAsset,
  updateMapping,
  type Asset,
  type Job,
  type ScriptDocument,
  type ScriptFootageMapDto,
  type TranscriptDto,
  type TranscriptSegmentDto,
  type UpdateMappingPayload,
} from "@/lib/api";
import { JobStatusBanner } from "@/components/scripts/JobStatusBanner";
import { useJobPoll } from "@/components/scripts/useJobPoll";
import { MappingEditForm } from "@/components/mapping/MappingEditForm";
import { MappingTable } from "@/components/mapping/MappingTable";
import { SceneFulfillmentPanel } from "@/components/mapping/SceneFulfillmentPanel";
import { TranscriptSegmentList } from "@/components/mapping/TranscriptSegmentList";

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
  const [transcripts, setTranscripts] = useState<TranscriptDto[]>([]);
  const [mappings, setMappings] = useState<ScriptFootageMapDto[]>([]);

  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string>("");
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(
    null,
  );
  const [seekHintMs, setSeekHintMs] = useState<number | null>(null);

  const [editing, setEditing] = useState<ScriptFootageMapDto | null>(null);
  const [savePending, setSavePending] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobLabel, setJobLabel] = useState("Mapping job");

  const projectAssets = useMemo(() => {
    const idSet = new Set(assetIds);
    return assets.filter(
      (a) =>
        idSet.has(a.id) &&
        (a.type === "VIDEO" || a.type === "AUDIO") &&
        !a.deletedAt,
    );
  }, [assets, assetIds]);

  const activeTranscript = useMemo(() => {
    if (transcripts.length === 0) return null;
    if (selectedTranscriptId) {
      return transcripts.find((t) => t.id === selectedTranscriptId) ?? null;
    }
    if (selectedAssetId) {
      return transcripts.find((t) => t.assetId === selectedAssetId) ?? null;
    }
    return transcripts[0] ?? null;
  }, [transcripts, selectedTranscriptId, selectedAssetId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetResult, scriptResult, transcriptResult, mappingResult] =
        await Promise.all([
          listAssets(),
          listProjectScripts(projectId),
          listProjectTranscripts(projectId),
          listProjectMappings(projectId),
        ]);

      const allAssets = assetResult.items ?? [];
      setAssets(allAssets);
      setScripts(scriptResult.items ?? []);
      setTranscripts(transcriptResult.items ?? []);
      setMappings(mappingResult.items ?? []);

      const attached = allAssets.filter(
        (a) =>
          assetIds.includes(a.id) &&
          (a.type === "VIDEO" || a.type === "AUDIO") &&
          !a.deletedAt,
      );

      setSelectedAssetId((prev) => {
        if (prev && attached.some((a) => a.id === prev)) return prev;
        return attached[0]?.id ?? "";
      });

      setSelectedScriptId((prev) => {
        const items = scriptResult.items ?? [];
        if (prev && items.some((s) => s.id === prev)) return prev;
        return items[0]?.id ?? "";
      });

      setSelectedTranscriptId((prev) => {
        const items = transcriptResult.items ?? [];
        if (prev && items.some((t) => t.id === prev)) return prev;
        const forAsset = items.find((t) => t.assetId === (attached[0]?.id ?? ""));
        return forAsset?.id ?? items[0]?.id ?? "";
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load mapping data",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, assetIds]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
    // intentionally load once per projectId mount / asset list change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, assetIds.join(",")]);

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

  async function onTranscribe() {
    if (!selectedAssetId) {
      setError("Select a footage asset to transcribe.");
      return;
    }
    await startJob("Transcribe footage", () =>
      transcribeProjectAsset(projectId, { assetId: selectedAssetId }),
    );
  }

  async function onAlign() {
    if (!selectedScriptId) {
      setError("Select a script to align.");
      return;
    }
    const transcriptId = activeTranscript?.id;
    if (!transcriptId && !selectedAssetId) {
      setError("Transcribe footage first, or select an asset.");
      return;
    }
    await startJob("Align script", () =>
      alignProjectScript(projectId, {
        scriptId: selectedScriptId,
        ...(transcriptId ? { transcriptId } : {}),
        ...(selectedAssetId ? { assetId: selectedAssetId } : {}),
      }),
    );
  }

  function onSelectSegment(segment: TranscriptSegmentDto, index: number) {
    setSelectedSegmentIndex(index);
    setSeekHintMs(segment.startMs);
  }

  async function onSaveMapping(payload: UpdateMappingPayload) {
    if (!editing) return;
    setSavePending(true);
    setError(null);
    try {
      const updated = await updateMapping(editing.id, payload);
      setMappings((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
      setEditing(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save mapping failed",
      );
    } finally {
      setSavePending(false);
    }
  }

  const busy = actionPending || polling || savePending;

  const activeScript = useMemo(
    () => scripts.find((s) => s.id === selectedScriptId) ?? scripts[0] ?? null,
    [scripts, selectedScriptId],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Scenes &amp; Footage
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Fill each script scene (upload or AI), review coverage, auto-trim to
          the plan, then use advanced mapping below if needed.
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

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading mapping data…</p>
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

      <div className="border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-semibold">Advanced mapping</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Line-level transcript align (optional). Prefer scene fill + auto-trim
          above for the main demo path.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-semibold">Transcribe</h3>
          {projectAssets.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No VIDEO/AUDIO assets attached. Attach footage on the Overview
              tab first.
            </p>
          ) : (
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Footage asset</span>
              <select
                value={selectedAssetId}
                onChange={(e) => {
                  setSelectedAssetId(e.target.value);
                  setSelectedSegmentIndex(null);
                  setSeekHintMs(null);
                  const match = transcripts.find(
                    (t) => t.assetId === e.target.value,
                  );
                  if (match) setSelectedTranscriptId(match.id);
                }}
                disabled={busy}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
              >
                {projectAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={busy || !selectedAssetId}
            onClick={() => void onTranscribe()}
            className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Transcribe selected footage
          </button>
        </div>

        <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-semibold">Align script</h3>
          {scripts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No scripts yet. Generate one on the Script tab first.
            </p>
          ) : (
            <label className="block space-y-1 text-sm">
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
          )}
          {transcripts.length > 1 ? (
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Transcript</span>
              <select
                value={activeTranscript?.id ?? ""}
                onChange={(e) => setSelectedTranscriptId(e.target.value)}
                disabled={busy}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
              >
                {transcripts.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.assetId.slice(0, 8)}… · {t.segments.length} segments
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            disabled={busy || !selectedScriptId}
            onClick={() => void onAlign()}
            className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Align script
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Transcript segments</h3>
            {seekHintMs != null ? (
              <span className="font-mono text-xs text-[var(--muted)]">
                Seek preview: {formatTimecode(seekHintMs)}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Click a segment to show its start time (player seek when available).
          </p>
          <TranscriptSegmentList
            segments={activeTranscript?.segments ?? []}
            selectedIndex={selectedSegmentIndex}
            onSelect={onSelectSegment}
          />
        </div>

        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-semibold">Script ↔ footage mapping</h3>
          <MappingTable
            mappings={mappings}
            selectedId={editing?.id}
            onEdit={setEditing}
          />
          {editing ? (
            <MappingEditForm
              mapping={editing}
              pending={savePending}
              onSave={(payload) => void onSaveMapping(payload)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
