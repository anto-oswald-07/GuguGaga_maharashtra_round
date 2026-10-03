"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  emptyTimelineJson,
  getTimeline,
  listAssets,
  listProjectTimelines,
  previewAssetIdFromJob,
  proposeGenerateTimeline,
  renderTimeline,
  saveTimeline,
  timelineFromJobOutput,
  timelineIdFromJob,
  type Asset,
  type Job,
  type TimelineDocument,
} from "@/lib/api";
import { hasToken } from "@/lib/auth-storage";
import { getProject } from "@/components/projects/project-api";
import { AiSuggestPanel } from "@/components/editor/AiSuggestPanel";
import {
  EditorStoreProvider,
  useEditorStore,
} from "@/components/editor/editor-store";
import { InspectorPanel } from "@/components/editor/InspectorPanel";
import { MediaBin } from "@/components/editor/MediaBin";
import { PreviewPane } from "@/components/editor/PreviewPane";
import { TracksPanel } from "@/components/editor/TracksPanel";
import { useJobPoll } from "@/components/scripts/useJobPoll";

type TimelineEditorProps = {
  projectId: string;
};

function TimelineEditorInner({ projectId }: TimelineEditorProps) {
  const router = useRouter();
  const {
    state,
    hydrate,
    setProposal,
    applyProposal,
    markClean,
    setPreviewAssetId,
  } = useEditorStore();

  const [ready, setReady] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [timelines, setTimelines] = useState<TimelineDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobLabel, setJobLabel] = useState("Editor job");
  const [jobKind, setJobKind] = useState<"suggest" | "render" | null>(null);
  const [pendingTimelineId, setPendingTimelineId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    const t = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(t);
  }, [router]);

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
      const [project, assetResult, timelineResult] = await Promise.all([
        getProject(projectId),
        listAssets(),
        listProjectTimelines(projectId),
      ]);
      setAssetIds(project.assetIds ?? []);
      setAssets(assetResult.items ?? []);
      const items = timelineResult.items ?? [];
      setTimelines(items);

      const preferred =
        items.find((t) => t.id === state.timelineId) ?? items[0] ?? null;
      if (preferred) {
        let doc = preferred;
        if (!doc.content) {
          try {
            doc = await getTimeline(preferred.id);
          } catch {
            // keep list payload
          }
        }
        hydrate(doc.id, doc.content ?? emptyTimelineJson());
      } else if (!state.dirty) {
        hydrate(null, emptyTimelineJson({ generatedBy: "user", empty: true }));
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load editor data",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, hydrate, state.timelineId, state.dirty]);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
    // intentionally once per project mount after auth ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, projectId]);

  const onJobTerminal = useCallback(
    async (job: Job) => {
      if (job.status === "FAILED") {
        setError(job.error || "Job failed");
        setJobKind(null);
        return;
      }

      if (jobKind === "suggest" || job.type === "GENERATE_TIMELINE") {
        const proposal = timelineFromJobOutput(job.output);
        if (proposal) {
          setProposal(proposal);
        } else {
          // Proposal may be persisted as ai_proposal version — refresh list
          await refresh();
          const tid = timelineIdFromJob(job, pendingTimelineId);
          if (tid) {
            try {
              const doc = await getTimeline(tid);
              const proposalVersion = [...doc.versions]
                .filter((v) => v.source && /ai_proposal|proposal/i.test(v.source))
                .sort((a, b) => b.version - a.version)[0];
              if (proposalVersion) {
                setProposal(proposalVersion.content);
              } else if (doc.content) {
                setProposal(doc.content);
              } else {
                setError(
                  "Suggest job succeeded but no timeline proposal was found in output.",
                );
              }
              if (!state.timelineId) hydrate(doc.id, doc.content ?? emptyTimelineJson());
            } catch {
              setError("Suggest succeeded but failed to load timeline proposal.");
            }
          } else {
            setError(
              "Suggest job succeeded but no timeline proposal was found in output.",
            );
          }
        }
        const tid = timelineIdFromJob(job, pendingTimelineId);
        if (tid && !state.timelineId) {
          // Keep id so Apply/Save can PUT; don't overwrite draft until Apply
          markClean(tid);
        }
      }

      if (jobKind === "render" || job.type === "RENDER_TIMELINE") {
        const assetId = previewAssetIdFromJob(job);
        if (assetId) setPreviewAssetId(assetId);
        else setError("Render succeeded but no preview assetId in job.output.");
      }

      setPendingTimelineId(null);
      setJobKind(null);
    },
    [
      jobKind,
      pendingTimelineId,
      setProposal,
      refresh,
      state.timelineId,
      hydrate,
      markClean,
      setPreviewAssetId,
    ],
  );

  const { job, error: pollError, polling } = useJobPoll(jobId, {
    onTerminal: (j) => {
      void onJobTerminal(j);
    },
  });

  async function startJob(
    label: string,
    kind: "suggest" | "render",
    runner: () => Promise<{ jobId: string; timelineId?: string }>,
  ) {
    setError(null);
    setActionPending(true);
    setJobLabel(label);
    setJobKind(kind);
    try {
      const result = await runner();
      if (result.timelineId) setPendingTimelineId(result.timelineId);
      if (result.jobId) setJobId(result.jobId);
    } catch (err) {
      setJobKind(null);
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

  async function onSuggest() {
    await startJob("AI suggest timeline", "suggest", () =>
      proposeGenerateTimeline(projectId),
    );
  }

  async function onSave() {
    if (!state.timelineId) {
      setError(
        "No timeline document yet — run AI Suggest first (API creates the timeline), then Apply / Save.",
      );
      return;
    }
    setActionPending(true);
    setError(null);
    try {
      const saved = await saveTimeline(state.timelineId, state.draft);
      markClean(saved.id || state.timelineId);
      setTimelines((prev) => {
        const others = prev.filter((t) => t.id !== saved.id);
        return [saved, ...others];
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save timeline failed",
      );
    } finally {
      setActionPending(false);
    }
  }

  async function onApplyProposal() {
    const proposal = state.proposal;
    if (!proposal) return;

    // Apply → local draft (FR-ED-006); then save if timeline exists
    applyProposal();

    const timelineId = state.timelineId ?? pendingTimelineId;
    if (!timelineId) {
      setError(null);
      return;
    }

    setActionPending(true);
    setError(null);
    try {
      const saved = await saveTimeline(timelineId, proposal);
      hydrate(saved.id || timelineId, saved.content ?? proposal);
      markClean(saved.id || timelineId);
      setTimelines((prev) => {
        const others = prev.filter((t) => t.id !== (saved.id || timelineId));
        return [saved, ...others];
      });
    } catch (err) {
      hydrate(timelineId, proposal);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Applied locally but save failed",
      );
    } finally {
      setActionPending(false);
    }
  }

  async function onRender() {
    if (!state.timelineId) {
      setError("Save a timeline before rendering.");
      return;
    }
    if (state.dirty) {
      setError("Save dirty edits before rendering.");
      return;
    }
    await startJob("Render timeline preview", "render", () =>
      renderTimeline(state.timelineId!),
    );
  }

  const busy = actionPending || polling;

  if (!ready) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-[var(--muted)]">Checking session…</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={`/projects/${projectId}`}
              className="text-[var(--brand)] hover:underline"
            >
              ← Project
            </Link>
            <span className="text-[var(--muted)]">Editor</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Timeline editor
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {state.timelineId
              ? `Timeline ${state.timelineId.slice(0, 8)}…`
              : "No timeline document yet"}
            {state.dirty ? " · unsaved changes" : ""}
            {timelines.length > 1 ? ` · ${timelines.length} docs` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Reload
          </button>
          <button
            type="button"
            disabled={busy || !state.timelineId}
            onClick={() => void onSave()}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy || !state.timelineId || state.dirty}
            onClick={() => void onRender()}
            className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Render preview
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading timeline…</p>
      ) : null}

      <AiSuggestPanel
        pending={busy}
        onSuggest={() => void onSuggest()}
        onApply={() => void onApplyProposal()}
      />

      {/* Layout: bin | preview | tracks | inspector */}
      <div className="grid gap-3 lg:grid-cols-[14rem_minmax(0,1.2fr)_minmax(0,1fr)_16rem] lg:items-stretch">
        <div className="min-h-[16rem] lg:min-h-[28rem]">
          <MediaBin assets={projectVideos} loading={loading} />
        </div>
        <div className="min-h-[16rem] lg:min-h-[28rem]">
          <PreviewPane
            job={jobKind === "render" || job?.type === "RENDER_TIMELINE" ? job : null}
            polling={polling && jobKind === "render"}
            pollError={jobKind === "render" ? pollError : null}
            jobLabel={jobLabel}
          />
        </div>
        <div className="min-h-[16rem] lg:min-h-[28rem]">
          <TracksPanel />
        </div>
        <div className="min-h-[16rem] lg:min-h-[28rem]">
          <InspectorPanel />
        </div>
      </div>

      {jobKind === "suggest" ? (
        <div className="text-sm text-[var(--muted)]">
          Suggest job: {job?.status ?? (polling ? "polling…" : "—")}
          {pollError ? ` · ${pollError}` : ""}
        </div>
      ) : null}
    </section>
  );
}

export function TimelineEditor({ projectId }: TimelineEditorProps) {
  return (
    <EditorStoreProvider>
      <TimelineEditorInner projectId={projectId} />
    </EditorStoreProvider>
  );
}
