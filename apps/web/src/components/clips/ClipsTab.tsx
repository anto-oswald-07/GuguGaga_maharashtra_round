"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  listAssets,
  listClipCandidates,
  listProjectScripts,
  proposeProjectClips,
  renderClipCandidate,
  updateClipCandidate,
  type Asset,
  type ClipCandidateDto,
  type Job,
  type ScriptDocument,
  type UpdateClipCandidatePayload,
} from "@/lib/api";
import { JobStatusBanner } from "@/components/scripts/JobStatusBanner";
import { useJobPoll } from "@/components/scripts/useJobPoll";
import { ClipCandidateTable } from "@/components/clips/ClipCandidateTable";
import { ClipEditForm } from "@/components/clips/ClipEditForm";
import { ClipRenderPreview } from "@/components/clips/ClipRenderPreview";

type ClipsTabProps = {
  projectId: string;
  assetIds: string[];
};

export function ClipsTab({ projectId, assetIds }: ClipsTabProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [scripts, setScripts] = useState<ScriptDocument[]>([]);
  const [candidates, setCandidates] = useState<ClipCandidateDto[]>([]);

  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ClipCandidateDto | null>(null);
  const [preview, setPreview] = useState<ClipCandidateDto | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobLabel, setJobLabel] = useState("Clips job");

  const projectVideos = useMemo(() => {
    const idSet = new Set(assetIds);
    return assets.filter(
      (a) => idSet.has(a.id) && a.type === "VIDEO" && !a.deletedAt,
    );
  }, [assets, assetIds]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetResult, scriptResult, clipResult] = await Promise.all([
        listAssets(),
        listProjectScripts(projectId),
        listClipCandidates(projectId),
      ]);

      const allAssets = assetResult.items ?? [];
      setAssets(allAssets);
      setScripts(scriptResult.items ?? []);
      const items = clipResult.items ?? [];
      setCandidates(items);

      const attached = allAssets.filter(
        (a) => assetIds.includes(a.id) && a.type === "VIDEO" && !a.deletedAt,
      );
      setSelectedAssetId((prev) => {
        if (prev && attached.some((a) => a.id === prev)) return prev;
        return attached[0]?.id ?? "";
      });
      setSelectedScriptId((prev) => {
        const scriptsItems = scriptResult.items ?? [];
        if (prev && scriptsItems.some((s) => s.id === prev)) return prev;
        return scriptsItems[0]?.id ?? "";
      });

      setEditing((prev) =>
        prev ? items.find((c) => c.id === prev.id) ?? null : null,
      );
      setPreview((prev) => {
        if (prev) {
          const next = items.find((c) => c.id === prev.id);
          if (next) return next;
        }
        return items.find((c) => c.status === "rendered") ?? null;
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load clips",
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

  async function onPropose() {
    await startJob("Propose clips", () =>
      proposeProjectClips(projectId, {
        ...(selectedAssetId ? { sourceAssetId: selectedAssetId } : {}),
        ...(selectedScriptId ? { scriptId: selectedScriptId } : {}),
      }),
    );
  }

  async function patchCandidate(
    candidate: ClipCandidateDto,
    payload: UpdateClipCandidatePayload,
  ) {
    setSavePending(true);
    setError(null);
    try {
      const updated = await updateClipCandidate(candidate.id, payload);
      setCandidates((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setEditing((prev) => (prev?.id === updated.id ? updated : prev));
      if (updated.status === "rendered" || updated.renderedAssetId) {
        setPreview(updated);
      }
      return updated;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Update candidate failed",
      );
      return null;
    } finally {
      setSavePending(false);
    }
  }

  async function onSaveEdit(payload: UpdateClipCandidatePayload) {
    if (!editing) return;
    const updated = await patchCandidate(editing, payload);
    if (updated) setEditing(null);
  }

  async function onAccept(candidate: ClipCandidateDto) {
    await patchCandidate(candidate, { status: "accepted" });
  }

  async function onReject(candidate: ClipCandidateDto) {
    await patchCandidate(candidate, { status: "rejected" });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(candidate.id);
      return next;
    });
  }

  async function onBatchAccept() {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      setError("Select one or more proposed candidates to batch-accept.");
      return;
    }
    setSavePending(true);
    setError(null);
    try {
      const results = await Promise.all(
        ids.map((id) => updateClipCandidate(id, { status: "accepted" })),
      );
      const byId = new Map(results.map((r) => [r.id, r]));
      setCandidates((prev) => prev.map((c) => byId.get(c.id) ?? c));
      setSelectedIds(new Set());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Batch accept failed",
      );
      await refresh();
    } finally {
      setSavePending(false);
    }
  }

  async function onRender(candidate: ClipCandidateDto) {
    if (candidate.status !== "accepted" && candidate.status !== "rendered") {
      setError("Accept the candidate before rendering.");
      return;
    }
    setPreview(candidate);
    await startJob("Render clip", () => renderClipCandidate(candidate.id));
  }

  function onToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onToggleSelectAllProposed() {
    const proposed = candidates.filter((c) => c.status === "proposed");
    const allSelected =
      proposed.length > 0 && proposed.every((c) => selectedIds.has(c.id));
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(proposed.map((c) => c.id)));
  }

  const busy = actionPending || polling || savePending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Clips</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Propose highlight candidates, tweak boundaries, accept/reject, and
          render MP4 clip assets.
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
        <p className="text-sm text-[var(--muted)]">Loading clip candidates…</p>
      ) : null}

      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="text-sm font-semibold">Propose</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Source footage (optional)</span>
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              disabled={busy}
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">All / project default</option>
              {projectVideos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Script cue (optional)</span>
            <select
              value={selectedScriptId}
              onChange={(e) => setSelectedScriptId(e.target.value)}
              disabled={busy}
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.topic || s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onPropose()}
            className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Propose clips
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.size === 0}
            onClick={() => void onBatchAccept()}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Batch accept ({selectedIds.size})
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Candidates</h3>
          <ClipCandidateTable
            candidates={candidates}
            selectedIds={selectedIds}
            editingId={editing?.id}
            onToggleSelect={onToggleSelect}
            onToggleSelectAllProposed={onToggleSelectAllProposed}
            onEdit={(c) => {
              setEditing(c);
              setPreview(c);
            }}
            onAccept={(c) => void onAccept(c)}
            onReject={(c) => void onReject(c)}
            onRender={(c) => void onRender(c)}
            busy={busy}
          />
          {editing ? (
            <ClipEditForm
              candidate={editing}
              pending={savePending}
              onSave={(payload) => void onSaveEdit(payload)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </div>

        <aside className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-semibold">Render preview</h3>
          <ClipRenderPreview candidate={preview} />
        </aside>
      </div>
    </div>
  );
}
