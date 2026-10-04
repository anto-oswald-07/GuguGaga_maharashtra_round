"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  deleteClipCandidate,
  formatTimecode,
  fulfillScene,
  listAssets,
  listClipCandidates,
  listProjectScripts,
  proposeProjectClips,
  renderClipCandidate,
  transcribeProjectAsset,
  updateClipCandidate,
  uploadAsset,
  type Asset,
  type ClipCandidateDto,
  type Job,
  type ScriptDocument,
  type ScriptScene,
} from "@/lib/api";
import { attachProjectAssets } from "@/components/projects/project-api";
import { JobStatusBanner } from "@/components/scripts/JobStatusBanner";
import { useJobPoll } from "@/components/scripts/useJobPoll";
import { ClipPlayer } from "@/components/assets/ClipPlayer";
import { ClipCandidateTable } from "@/components/clips/ClipCandidateTable";

type ClipsTabProps = {
  projectId: string;
  assetIds: string[];
  onAssetsChanged?: () => void;
};

export function ClipsTab({
  projectId,
  assetIds,
  onAssetsChanged,
}: ClipsTabProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [scripts, setScripts] = useState<ScriptDocument[]>([]);
  const [candidates, setCandidates] = useState<ClipCandidateDto[]>([]);

  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(
    new Set(),
  );

  // Uploading long video state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(
    null,
  );

  // Preview & boundary editing state
  const [previewClipSceneIds, setPreviewClipSceneIds] = useState<
    Record<string, boolean>
  >({});
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(
    null,
  );
  const [editTitle, setEditTitle] = useState("");
  const [editStartMs, setEditStartMs] = useState(0);
  const [editEndMs, setEditEndMs] = useState(0);

  // Collapsible raw candidate table
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobLabel, setJobLabel] = useState("Clips job");

  const projectVideos = useMemo(() => {
    const idSet = new Set(assetIds);
    return assets.filter(
      (a) => idSet.has(a.id) && a.type === "VIDEO" && !a.deletedAt,
    );
  }, [assets, assetIds]);

  const activeScript = useMemo(
    () => scripts.find((s) => s.id === selectedScriptId) ?? scripts[0] ?? null,
    [scripts, selectedScriptId],
  );

  const scenes: ScriptScene[] = activeScript?.content?.scenes ?? [];

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
      const scriptItems = scriptResult.items ?? [];
      setScripts(scriptItems);
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
        if (prev && scriptItems.some((s) => s.id === prev)) return prev;
        return scriptItems[0]?.id ?? "";
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load clips and footage",
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

  // Upload long footage and immediately auto-trim clips matching script
  async function onUploadAndAutoTrim() {
    if (!uploadFile) {
      setError("Please choose a video file first.");
      return;
    }
    setError(null);
    setUploadPending(true);
    setUploadProgressText("1/3: Uploading long video to project…");
    try {
      const uploaded = await uploadAsset(uploadFile, {
        name: uploadFile.name,
        tags: "long-footage,raw",
      });
      await attachProjectAssets(projectId, [uploaded.id]);
      onAssetsChanged?.();
      setSelectedAssetId(uploaded.id);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setUploadProgressText("2/3: Transcribing audio from long footage…");
      await startJob("Transcribe long footage", () =>
        transcribeProjectAsset(projectId, { assetId: uploaded.id }),
      );

      setUploadProgressText("3/3: Auto-trimming clips matching script…");
      await startJob("Auto-trim to script", () =>
        proposeProjectClips(projectId, {
          sourceAssetId: uploaded.id,
          scriptId: activeScript?.id,
        }),
      );
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Upload and auto-trim failed",
      );
    } finally {
      setUploadPending(false);
      setUploadProgressText(null);
    }
  }

  // Auto-trim using already attached footage
  async function onAutoTrimExisting() {
    const sourceId = selectedAssetId || projectVideos[0]?.id;
    if (!sourceId) {
      setError("No source footage found. Please upload a long video file above.");
      return;
    }
    setError(null);
    await startJob("Auto-trim to script", () =>
      proposeProjectClips(projectId, {
        sourceAssetId: sourceId,
        scriptId: activeScript?.id,
      }),
    );
    await refresh();
  }

  // Helper to match a script scene to its candidate
  function getCandidateForScene(
    scene: ScriptScene,
    allCandidates: ClipCandidateDto[],
  ): ClipCandidateDto | null {
    // 1. By title matching scene title / ordinal / beat
    const ordinalTarget = `scene ${scene.ordinal + 1}`.toLowerCase();
    const byOrdinal = allCandidates.find((c) =>
      c.title.toLowerCase().startsWith(ordinalTarget),
    );
    if (byOrdinal) return byOrdinal;

    const byBeat = allCandidates.find(
      (c) =>
        c.title.toLowerCase().includes(scene.beatType.toLowerCase()) ||
        c.title.toLowerCase().includes(scene.title.toLowerCase()),
    );
    if (byBeat) return byBeat;

    // 2. By scene fulfillment asset link
    if (scene.fulfillment?.assetId) {
      const byRendered = allCandidates.find(
        (c) => c.renderedAssetId === scene.fulfillment.assetId,
      );
      if (byRendered) return byRendered;
      const bySource = allCandidates.find(
        (c) => c.assetId === scene.fulfillment.assetId,
      );
      if (bySource) return bySource;
    }

    // 3. By index fallback
    if (allCandidates[scene.ordinal]) {
      return allCandidates[scene.ordinal];
    }

    return null;
  }

  // Render a specific clip
  async function onRenderClip(candidate: ClipCandidateDto, sceneId?: string) {
    if (candidate.status !== "accepted" && candidate.status !== "rendered") {
      try {
        await updateClipCandidate(candidate.id, { status: "accepted" });
      } catch {
        // ignore
      }
    }
    await startJob(`Render clip “${candidate.title || "Clip"}”`, () =>
      renderClipCandidate(candidate.id),
    );
    if (sceneId) {
      setPreviewClipSceneIds((prev) => ({ ...prev, [sceneId]: true }));
    }
  }

  // Render all clips
  async function onRenderAll() {
    const toRender = candidates.filter((c) => c.status !== "rendered");
    if (toRender.length === 0) {
      setError("All clip candidates are already rendered.");
      return;
    }
    setError(null);
    for (const c of toRender) {
      await startJob(`Render clip “${c.title || "Clip"}”`, () =>
        renderClipCandidate(c.id),
      );
    }
    await refresh();
  }

  // Apply trimmed clip as the fulfillment for this script scene
  async function onUseInScene(
    scene: ScriptScene,
    candidate: ClipCandidateDto,
  ) {
    if (!activeScript) return;
    setError(null);
    setActionPending(true);
    try {
      const assetIdToUse = candidate.renderedAssetId || candidate.assetId;
      if (!assetIdToUse) {
        setError("Please render the clip before using it in the scene.");
        return;
      }
      await fulfillScene(projectId, {
        scriptId: activeScript.id,
        sceneId: scene.id,
        assetId: assetIdToUse,
      });
      await updateClipCandidate(candidate.id, { status: "accepted" });
      onAssetsChanged?.();
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to apply clip to scene",
      );
    } finally {
      setActionPending(false);
    }
  }

  function startEditBoundaries(candidate: ClipCandidateDto) {
    setEditingCandidateId(candidate.id);
    setEditTitle(candidate.title);
    setEditStartMs(candidate.startMs);
    setEditEndMs(candidate.endMs);
  }

  async function onSaveBoundaries() {
    if (!editingCandidateId) return;
    if (editEndMs <= editStartMs) {
      setError("End timecode must be greater than start timecode.");
      return;
    }
    setError(null);
    setActionPending(true);
    try {
      await updateClipCandidate(editingCandidateId, {
        title: editTitle.trim(),
        startMs: editStartMs,
        endMs: editEndMs,
      });
      setEditingCandidateId(null);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to update clip boundaries",
      );
    } finally {
      setActionPending(false);
    }
  }

  async function onDeleteCandidate(candidate: ClipCandidateDto) {
    if (
      !window.confirm(
        `Delete clip “${candidate.title || "Untitled"}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionPending(true);
    setError(null);
    try {
      await deleteClipCandidate(candidate.id);
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      if (editingCandidateId === candidate.id) setEditingCandidateId(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Delete candidate failed",
      );
    } finally {
      setActionPending(false);
    }
  }

  const busy = actionPending || polling || uploadPending;

  const trimmedScenesCount = scenes.filter((scene) => {
    const cand = getCandidateForScene(scene, candidates);
    return Boolean(cand);
  }).length;

  const renderedScenesCount = scenes.filter((scene) => {
    const cand = getCandidateForScene(scene, candidates);
    return Boolean(cand?.renderedAssetId || cand?.status === "rendered");
  }).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Auto-Trim Clips
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Upload long source footage and automatically trim short video clips
            tailored to each script scene beat (Hook, Body, CTA).
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <span className="rounded border border-[var(--border)] bg-white px-2 py-0.5 font-medium text-[var(--foreground)]">
              {projectVideos.length} long video
              {projectVideos.length === 1 ? "" : "s"} attached
            </span>
            <span className="rounded border border-[var(--brand)]/30 bg-[var(--brand)]/5 px-2 py-0.5 font-medium text-[var(--brand)]">
              {candidates.length} clip candidate
              {candidates.length === 1 ? "" : "s"}
            </span>
            {scenes.length > 0 ? (
              <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
                {trimmedScenesCount}/{scenes.length} script scenes trimmed
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <JobStatusBanner
        job={job}
        polling={polling}
        error={pollError}
        label={jobLabel}
      />

      {error ? (
        <p
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {uploadProgressText ? (
        <div className="flex items-center gap-2.5 rounded-md border border-[var(--brand)]/30 bg-[var(--brand)]/5 px-3 py-2 text-sm text-[var(--brand)] font-medium">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <span>{uploadProgressText}</span>
        </div>
      ) : null}

      {/* Script Selector (if multiple scripts exist) */}
      {scripts.length > 1 ? (
        <label className="block max-w-md space-y-1 text-sm">
          <span className="font-medium">Active Script</span>
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

      {/* STEP 1: Upload Long Footage & Auto-Trim Control Box */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3.5">
        <div>
          <h3 className="text-sm font-semibold">
            Upload Long Footage &amp; Auto-Trim
          </h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Upload your raw recording (A-roll or full take). The system will
            transcribe it and auto-trim the best short clips for each script
            beat.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          {/* File Upload Control */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-[var(--foreground)]">
              Option A: Upload new long video
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <label
                htmlFor="long-footage-upload-input"
                className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-1.5 text-sm font-medium text-white shadow-xs transition hover:bg-[var(--brand)]/90 active:scale-95"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                Choose File
              </label>
              <input
                id="long-footage-upload-input"
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setUploadFile(f);
                }}
                disabled={busy}
                className="block w-full max-w-xs text-sm text-[var(--foreground)] file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200 cursor-pointer border border-[var(--border)] rounded-md bg-white p-1"
              />
              <button
                type="button"
                disabled={busy || !uploadFile}
                onClick={() => void onUploadAndAutoTrim()}
                className="rounded-md bg-emerald-700 px-3.5 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-emerald-800 transition disabled:opacity-40"
              >
                Upload &amp; Auto-Trim
              </button>
            </div>
            {uploadFile ? (
              <p className="text-xs text-emerald-700 font-medium">
                Ready to upload: {uploadFile.name} (
                {(uploadFile.size / (1024 * 1024)).toFixed(1)} MB)
              </p>
            ) : null}
          </div>

          <div className="hidden md:flex justify-center text-xs uppercase font-bold text-[var(--muted)]">
            or
          </div>

          {/* Existing Project Video Selector */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-[var(--foreground)]">
              Option B: Pick from attached footage
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                disabled={busy || projectVideos.length === 0}
                className="flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm min-w-[180px]"
              >
                {projectVideos.length === 0 ? (
                  <option value="">No attached videos yet</option>
                ) : (
                  projectVideos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                disabled={busy || projectVideos.length === 0}
                onClick={() => void onAutoTrimExisting()}
                className="rounded-md bg-[var(--brand)] px-3.5 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-[var(--brand)]/90 transition disabled:opacity-40"
              >
                Auto-Trim to Script
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 2: Script Scenes Auto-Trim List (Interface similar to Footage & Scenes) */}
      {!activeScript ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center space-y-2">
          <h3 className="text-base font-semibold">No script found</h3>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto">
            Generate or create a script in the Script tab first. The script
            scenes and beats will become the checklist to auto-trim your video.
          </p>
          <Link
            href={`/projects/${projectId}?tab=script`}
            className="inline-block mt-2 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
          >
            Go to Script Tab →
          </Link>
        </div>
      ) : scenes.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center space-y-2">
          <h3 className="text-base font-semibold">Script has no scene beats</h3>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto">
            Open the Script tab and click save or generate so scenes (Hook, Body,
            CTA) are structured.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                Auto-Trimmed Scenes ({trimmedScenesCount}/{scenes.length} trimmed)
              </h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Review the trimmed clip for each script scene beat, adjust
                start/end boundaries if needed, render the clips, or open them in
                the editor.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAutoTrimExisting()}
                className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-[var(--brand)]/90 transition disabled:opacity-40"
              >
                Auto-Trim All
              </button>
              <button
                type="button"
                disabled={busy || candidates.length === 0}
                onClick={() => void onRenderAll()}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-slate-50 transition disabled:opacity-40"
              >
                Render All ({candidates.length})
              </button>
              <Link
                href={`/projects/${projectId}/editor`}
                className="rounded-md bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-900 transition flex items-center gap-1.5"
              >
                Open in Editor →
              </Link>
            </div>
          </div>

          {/* All Scenes Trimmed Banner */}
          {renderedScenesCount === scenes.length && scenes.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-sm font-medium text-emerald-950">
                    All {scenes.length} scene clips are rendered and ready!
                  </p>
                  <p className="text-xs text-emerald-800">
                    Your trimmed clips are ready to sequence in the Timeline
                    Editor.
                  </p>
                </div>
              </div>
              <Link
                href={`/projects/${projectId}/editor`}
                className="rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-900 transition"
              >
                Open in Editor →
              </Link>
            </div>
          ) : null}

          {/* Scene Cards List (Interface identical to Footage & Scenes) */}
          <ul className="space-y-3">
            {scenes.map((scene) => {
              const cand = getCandidateForScene(scene, candidates);
              const isClipPreviewOpen = Boolean(previewClipSceneIds[scene.id]);
              const isEditing = editingCandidateId === cand?.id;
              const isRendered = Boolean(
                cand?.renderedAssetId || cand?.status === "rendered",
              );
              const isAccepted = cand?.status === "accepted";

              return (
                <li
                  key={scene.id}
                  className="rounded-md border border-[var(--border)] bg-white p-3.5 transition space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-[var(--muted)]">
                          #{scene.ordinal + 1}
                        </span>
                        <span className="font-medium text-[var(--foreground)]">
                          {scene.title}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase tracking-wide font-semibold text-slate-700">
                          {scene.beatType}
                        </span>
                        {isRendered ? (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Rendered Clip
                          </span>
                        ) : isAccepted ? (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                            Accepted
                          </span>
                        ) : cand ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            Proposed
                          </span>
                        ) : (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            Not Trimmed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--foreground)] line-clamp-2 italic">
                        &ldquo;{scene.spokenText}&rdquo;
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Target duration: {formatTimecode(scene.targetDurationMs)}
                        {scene.visualBrief ? ` · ${scene.visualBrief}` : ""}
                      </p>
                    </div>

                    {/* Scene Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {cand ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewClipSceneIds((prev) => ({
                                ...prev,
                                [scene.id]: !prev[scene.id],
                              }));
                            }}
                            className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium transition ${
                              isClipPreviewOpen
                                ? "border-emerald-600 bg-emerald-600 text-white shadow-xs"
                                : "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                            }`}
                          >
                            {isClipPreviewOpen ? "Hide Clip" : "View Clip"}
                          </button>

                          <button
                            type="button"
                            onClick={() => startEditBoundaries(cand)}
                            disabled={busy}
                            className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-sm text-[var(--foreground)] hover:bg-slate-50 disabled:opacity-40"
                            title="Tweak clip start and end timecodes"
                          >
                            Adjust
                          </button>

                          <button
                            type="button"
                            disabled={busy || isRendered}
                            onClick={() => void onRenderClip(cand, scene.id)}
                            className="rounded-md bg-[var(--brand)] px-2.5 py-1 text-sm font-medium text-white hover:bg-[var(--brand)]/90 transition disabled:opacity-40"
                          >
                            {isRendered ? "Rendered" : "Render Clip"}
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onUseInScene(scene, cand)}
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-900 hover:bg-emerald-100 transition disabled:opacity-40"
                            title="Use this trimmed clip as the footage for this scene"
                          >
                            Use in Scene
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || projectVideos.length === 0}
                          onClick={() => void onAutoTrimExisting()}
                          className="rounded-md bg-[var(--brand)] px-3 py-1 text-sm font-medium text-white shadow-xs hover:bg-[var(--brand)]/90 transition disabled:opacity-40"
                        >
                          Auto-Trim Scene
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Matched Trimmed Window Details Box */}
                  {cand ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-[var(--foreground)] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span>
                          <strong className="text-slate-900">
                            Trim Window:
                          </strong>{" "}
                          <span className="font-mono">
                            {formatTimecode(cand.startMs)} →{" "}
                            {formatTimecode(cand.endMs)}
                          </span>
                        </span>
                        <span className="text-[var(--muted)]">
                          Duration:{" "}
                          <strong className="text-slate-800">
                            {((cand.endMs - cand.startMs) / 1000).toFixed(1)}s
                          </strong>
                        </span>
                        <span className="rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-teal-800 font-medium">
                          {Math.round(cand.score * 100)}% match
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--muted)]">
                        <span className="truncate max-w-[200px]">
                          {cand.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => void onDeleteCandidate(cand)}
                          disabled={busy}
                          className="text-red-600 hover:text-red-800 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-[var(--border)] bg-slate-50/50 p-3 text-center text-xs text-[var(--muted)]">
                      No clip trimmed for this scene yet. Click &ldquo;Upload
                      Long Footage&rdquo; or &ldquo;Auto-Trim All&rdquo; above to
                      derive it automatically from the script.
                    </div>
                  )}

                  {/* Inline Boundary Adjustment Form */}
                  {isEditing && cand ? (
                    <div className="rounded-md border border-[var(--brand)]/40 bg-[var(--brand)]/5 p-3 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[var(--brand)]">
                          Adjust Clip Boundaries for {scene.title}
                        </span>
                        <span className="font-mono text-[var(--muted)]">
                          {formatTimecode(editStartMs)} →{" "}
                          {formatTimecode(editEndMs)} (
                          {((editEndMs - editStartMs) / 1000).toFixed(1)}s)
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block space-y-1 text-xs">
                          <span className="font-medium text-[var(--muted)]">
                            Title
                          </span>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full rounded border border-[var(--border)] bg-white px-2.5 py-1 text-sm"
                          />
                        </label>
                        <label className="block space-y-1 text-xs">
                          <span className="font-medium text-[var(--muted)]">
                            Start (ms)
                          </span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step={100}
                              value={editStartMs}
                              onChange={(e) =>
                                setEditStartMs(Number(e.target.value))
                              }
                              className="w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-sm font-mono"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setEditStartMs((v) => Math.max(0, v - 500))
                              }
                              className="px-1.5 py-1 rounded border bg-white text-xs hover:bg-slate-50"
                            >
                              -0.5s
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditStartMs((v) => v + 500)}
                              className="px-1.5 py-1 rounded border bg-white text-xs hover:bg-slate-50"
                            >
                              +0.5s
                            </button>
                          </div>
                        </label>
                        <label className="block space-y-1 text-xs">
                          <span className="font-medium text-[var(--muted)]">
                            End (ms)
                          </span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={editStartMs}
                              step={100}
                              value={editEndMs}
                              onChange={(e) =>
                                setEditEndMs(Number(e.target.value))
                              }
                              className="w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-sm font-mono"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setEditEndMs((v) =>
                                  Math.max(editStartMs + 500, v - 500),
                                )
                              }
                              className="px-1.5 py-1 rounded border bg-white text-xs hover:bg-slate-50"
                            >
                              -0.5s
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditEndMs((v) => v + 500)}
                              className="px-1.5 py-1 rounded border bg-white text-xs hover:bg-slate-50"
                            >
                              +0.5s
                            </button>
                          </div>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onSaveBoundaries()}
                          className="rounded bg-[var(--brand)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--brand)]/90"
                        >
                          Save Boundaries
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCandidateId(null)}
                          className="rounded border border-[var(--border)] bg-white px-3 py-1 text-xs hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Inline Video Player Preview */}
                  {isClipPreviewOpen && cand ? (
                    <div className="mt-2.5">
                      <ClipPlayer
                        assetId={cand.renderedAssetId || cand.assetId || undefined}
                        title={`${scene.title} — ${cand.title || "Trimmed Clip"}`}
                        type="VIDEO"
                        onClose={() =>
                          setPreviewClipSceneIds((prev) => ({
                            ...prev,
                            [scene.id]: false,
                          }))
                        }
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* STEP 3: Collapsible Candidate Table & Batch Actions for Power Users */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              All Clip Candidates ({candidates.length})
            </h3>
            <p className="text-xs text-[var(--muted)]">
              View raw scored candidate list, select batches, or delete
              unneeded clips.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAllCandidates((v) => !v)}
            className="rounded border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-slate-50"
          >
            {showAllCandidates ? "Hide Table" : "Show Table"}
          </button>
        </div>

        {showAllCandidates ? (
          <div className="pt-2">
            <ClipCandidateTable
              candidates={candidates}
              selectedIds={selectedCandidateIds}
              onToggleSelect={(id) => {
                setSelectedCandidateIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onToggleSelectAllProposed={() => {
                const proposed = candidates.filter(
                  (c) => c.status === "proposed",
                );
                const allSelected =
                  proposed.length > 0 &&
                  proposed.every((c) => selectedCandidateIds.has(c.id));
                if (allSelected) {
                  setSelectedCandidateIds(new Set());
                } else {
                  setSelectedCandidateIds(new Set(proposed.map((c) => c.id)));
                }
              }}
              onEdit={(c) => startEditBoundaries(c)}
              onAccept={(c) => {
                void updateClipCandidate(c.id, { status: "accepted" }).then(
                  () => void refresh(),
                );
              }}
              onReject={(c) => {
                void updateClipCandidate(c.id, { status: "rejected" }).then(
                  () => void refresh(),
                );
              }}
              onRender={(c) => void onRenderClip(c)}
              onDelete={(c) => void onDeleteCandidate(c)}
              busy={busy}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
