"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  emptyTimelineJson,
  getTimeline,
  listAssets,
  listProjectScripts,
  listProjectTimelines,
  previewAssetIdFromJob,
  proposeGenerateTimeline,
  renderTimeline,
  saveTimeline,
  createProjectTimeline,
  timelineFromJobOutput,
  timelineIdFromJob,
  type Asset,
  type Job,
  type ScriptScene,
  type TimelineDocument,
  type TimelineJson,
  type TimelineVideoClip,
} from "@/lib/api";
import { hasToken } from "@/lib/auth-storage";
import {
  attachProjectAssets,
  getProject,
} from "@/components/projects/project-api";
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

function getAssetDurationMs(asset?: Asset | null, fallback = 5000): number {
  if (!asset) return fallback;
  if (typeof (asset.metadata as { durationMs?: number } | null)?.durationMs === "number") {
    return Math.max(500, (asset.metadata as { durationMs: number }).durationMs);
  }
  if (typeof (asset.metadata as { durationSec?: number } | null)?.durationSec === "number") {
    return Math.max(500, Math.round(Number((asset.metadata as { durationSec: number }).durationSec) * 1000));
  }
  return fallback;
}

function buildSceneSequenceDraft(
  fulfilledScenes: ScriptScene[],
  allAssets: Asset[],
  existingDraft?: TimelineJson,
): TimelineJson {
  let cursor = 0;
  const videoClips: TimelineVideoClip[] = [];

  for (let i = 0; i < fulfilledScenes.length; i++) {
    const scene = fulfilledScenes[i]!;
    const asset = allAssets.find((a) => a.id === scene.fulfillment.assetId);
    const dur = getAssetDurationMs(asset, scene.targetDurationMs || 5000);
    const start = cursor;
    const isImage = asset?.type === "IMAGE";
    videoClips.push({
      id: `c${i + 1}`,
      assetId: scene.fulfillment.assetId!,
      srcStartMs: 0,
      srcEndMs: dur,
      timelineStartMs: start,
      mediaKind: isImage ? "image" : "video",
      label: scene.title || asset?.name || `Scene ${scene.ordinal + 1}`,
    });
    cursor += dur;
  }

  const existingAudio =
    existingDraft?.tracks?.find((t) => t.type === "audio")?.clips ?? [];
  const existingText =
    existingDraft?.tracks?.find((t) => t.type === "text")?.items ?? [];
  const existingCaptions =
    existingDraft?.tracks?.find((t) => t.type === "captions")?.items ?? [];

  return {
    schemaVersion: "1.0",
    fps: 30,
    durationMs: Math.max(cursor, 0),
    tracks: [
      { id: "v1", type: "video", clips: videoClips },
      { id: "a1", type: "audio", clips: existingAudio },
      { id: "t1", type: "text", items: existingText },
      { id: "cap1", type: "captions", items: existingCaptions },
    ],
    transitions: [],
    meta: {
      generatedBy: "scene_sequencer",
      notes: `Auto-sequenced ${videoClips.length} clip(s) from script scenes.`,
    },
  };
}

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
    replaceDraft,
  } = useEditorStore();

  const [ready, setReady] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [timelines, setTimelines] = useState<TimelineDocument[]>([]);
  const [fulfilledScenes, setFulfilledScenes] = useState<ScriptScene[]>([]);
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

  const projectMedia = useMemo(() => {
    const idSet = new Set(assetIds);
    return assets.filter(
      (a) =>
        idSet.has(a.id) &&
        (a.type === "VIDEO" || a.type === "IMAGE" || a.type === "AUDIO") &&
        !a.deletedAt,
    );
  }, [assets, assetIds]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [project, assetResult, timelineResult, scriptResult] =
        await Promise.all([
          getProject(projectId),
          listAssets(),
          listProjectTimelines(projectId),
          listProjectScripts(projectId).catch(() => ({ items: [] })),
        ]);
      const currentAssetIds = project.assetIds ?? [];
      const allAssets = assetResult.items ?? [];
      setAssetIds(currentAssetIds);
      setAssets(allAssets);
      const items = timelineResult.items ?? [];
      setTimelines(items);

      const scripts = scriptResult.items ?? [];
      const activeScript = scripts[0] ?? null;
      const scenes = (activeScript?.content?.scenes ?? [])
        .slice()
        .sort((a, b) => a.ordinal - b.ordinal);
      const readyScenes = scenes.filter(
        (s) =>
          Boolean(s.fulfillment?.assetId) && s.fulfillment.mode !== "EMPTY",
      );
      setFulfilledScenes(readyScenes);

      const preferred =
        items.find((t) => t.id === state.timelineId) ?? items[0] ?? null;
      let doc = preferred;
      if (preferred && (!preferred.content || !preferred.versions)) {
        try {
          doc = await getTimeline(preferred.id);
        } catch {
          // keep list payload
        }
      }

      const existingVideoClips =
        doc?.content?.tracks?.find((t) => t.type === "video")?.clips ?? [];

      if (existingVideoClips.length > 0) {
        // Saved timeline with clips already exists — load it
        hydrate(doc!.id, doc!.content!);
        const proposalVersion = [...(doc!.versions ?? [])]
          .filter((v) => v.source && /ai_proposal|proposal/i.test(v.source))
          .sort((a, b) => b.version - a.version)[0];
        if (proposalVersion && !state.proposal) {
          setProposal(proposalVersion.content);
        } else if (doc!.pendingProposal && !state.proposal) {
          setProposal(doc!.pendingProposal);
        } else {
          setProposal(null);
        }
      } else if (readyScenes.length > 0) {
        // Auto-add clips to sequence that were generated by script and attached in Footage & Scenes!
        const autoDraft = buildSceneSequenceDraft(
          readyScenes,
          allAssets,
          doc?.content ?? undefined,
        );
        hydrate(doc?.id ?? null, autoDraft);
        setProposal(null);
      } else if (doc && doc.content) {
        hydrate(doc.id, doc.content);
        setProposal(null);
      } else if (doc && !doc.content) {
        hydrate(doc.id, emptyTimelineJson({ generatedBy: "user", empty: true }));
        setProposal(null);
      } else if (!state.dirty) {
        hydrate(null, emptyTimelineJson({ generatedBy: "user", empty: true }));
        setProposal(null);
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
  }, [projectId, hydrate, setProposal, state.timelineId, state.dirty, state.proposal]);

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
              } else if (doc.pendingProposal) {
                setProposal(doc.pendingProposal);
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
    setActionPending(true);
    setError(null);
    try {
      let timelineId = state.timelineId;
      if (!timelineId) {
        const created = await createProjectTimeline(projectId, state.draft);
        timelineId = created.id;
        hydrate(timelineId, created.content ?? state.draft);
        markClean(timelineId);
        setTimelines((prev) => [created, ...prev]);
      } else {
        const saved = await saveTimeline(timelineId, state.draft);
        markClean(saved.id || timelineId);
        setTimelines((prev) => {
          const others = prev.filter((t) => t.id !== saved.id);
          return [saved, ...others];
        });
      }
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

  async function onApplyAudio(suggestedAsset?: Asset) {
    let audioAsset = suggestedAsset;
    if (!audioAsset) {
      audioAsset = assets.find(
        (a) => (a.type === "AUDIO" || a.mime?.startsWith("audio/")) && !a.deletedAt,
      );
    }
    const audioTrack = state.proposal?.tracks.find((t) => t.type === "audio");
    const proposalAudioClip =
      audioTrack && audioTrack.type === "audio" ? audioTrack.clips[0] : null;

    const targetAssetId = proposalAudioClip?.assetId || audioAsset?.id;
    const targetLabel =
      proposalAudioClip?.label || audioAsset?.name || "Background Music";

    if (!targetAssetId) {
      setError("No audio track found. Upload an audio file in the Assets library first.");
      return;
    }

    // Attach to project if not yet attached so counts and mapping are consistent
    if (!assetIds.includes(targetAssetId)) {
      try {
        await attachProjectAssets(projectId, [targetAssetId]);
        setAssetIds((prev) => [...prev, targetAssetId]);
      } catch {
        // ignore if already linked
      }
    }

    const dur = Math.max(5000, state.draft.durationMs || 30_000);
    const audioClip = {
      id: `aud-${Date.now()}`,
      assetId: targetAssetId,
      srcStartMs: 0,
      srcEndMs: dur,
      timelineStartMs: 0,
      label: targetLabel,
    };

    const currentDraft = state.draft;
    const audioIdx = currentDraft.tracks.findIndex((t) => t.type === "audio");
    const updatedTracks = [...currentDraft.tracks];
    if (audioIdx >= 0) {
      updatedTracks[audioIdx] = {
        ...updatedTracks[audioIdx]!,
        type: "audio",
        clips: [audioClip],
      };
    } else {
      updatedTracks.push({
        id: "a1",
        type: "audio",
        clips: [audioClip],
      });
    }

    const nextDraft: TimelineJson = {
      ...currentDraft,
      tracks: updatedTracks,
    };

    let timelineId = state.timelineId ?? pendingTimelineId;
    setActionPending(true);
    setError(null);
    try {
      if (!timelineId) {
        const created = await createProjectTimeline(projectId, nextDraft);
        timelineId = created.id;
        hydrate(timelineId, created.content ?? nextDraft);
        markClean(timelineId);
        setTimelines((prev) => [created, ...prev]);
      } else {
        const saved = await saveTimeline(timelineId, nextDraft);
        hydrate(saved.id || timelineId, saved.content ?? nextDraft);
        markClean(saved.id || timelineId);
        setTimelines((prev) => {
          const others = prev.filter((t) => t.id !== (saved.id || timelineId));
          return [saved, ...others];
        });
      }
    } catch (err) {
      hydrate(timelineId ?? null, nextDraft);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Applied audio locally, but save failed",
      );
    } finally {
      setActionPending(false);
    }
  }

  async function onApplyCaptionsAndText() {
    const proposal = state.proposal;
    if (!proposal) return;

    const propCapTrack = proposal.tracks.find((t) => t.type === "captions");
    const propTextTrack = proposal.tracks.find((t) => t.type === "text");

    const currentDraft = state.draft;
    const updatedTracks = currentDraft.tracks.map((t) => {
      if (t.type === "captions" && propCapTrack && propCapTrack.type === "captions") {
        return { ...t, items: propCapTrack.items.map((i) => ({ ...i })) };
      }
      if (t.type === "text" && propTextTrack && propTextTrack.type === "text") {
        return { ...t, items: propTextTrack.items.map((i) => ({ ...i })) };
      }
      return t;
    });

    if (!updatedTracks.some((t) => t.type === "captions") && propCapTrack && propCapTrack.type === "captions") {
      updatedTracks.push({
        id: "cap1",
        type: "captions",
        items: propCapTrack.items.map((i) => ({ ...i })),
      });
    }
    if (!updatedTracks.some((t) => t.type === "text") && propTextTrack && propTextTrack.type === "text") {
      updatedTracks.push({
        id: "t1",
        type: "text",
        items: propTextTrack.items.map((i) => ({ ...i })),
      });
    }

    const nextDraft: TimelineJson = {
      ...currentDraft,
      tracks: updatedTracks,
    };

    let timelineId = state.timelineId ?? pendingTimelineId;
    setActionPending(true);
    setError(null);
    try {
      if (!timelineId) {
        const created = await createProjectTimeline(projectId, nextDraft);
        timelineId = created.id;
        hydrate(timelineId, created.content ?? nextDraft);
        markClean(timelineId);
        setTimelines((prev) => [created, ...prev]);
      } else {
        const saved = await saveTimeline(timelineId, nextDraft);
        hydrate(saved.id || timelineId, saved.content ?? nextDraft);
        markClean(saved.id || timelineId);
        setTimelines((prev) => {
          const others = prev.filter((t) => t.id !== (saved.id || timelineId));
          return [saved, ...others];
        });
      }
    } catch (err) {
      hydrate(timelineId ?? null, nextDraft);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Applied captions & text locally, but save failed",
      );
    } finally {
      setActionPending(false);
    }
  }

  async function onApplyProposal() {
    const proposal = state.proposal;
    if (!proposal) return;

    let proposalToApply = proposal;
    const audioTrack = proposal.tracks.find((t) => t.type === "audio");
    const audioAsset = (assets).find(
      (a) => (a.type === "AUDIO" || a.mime?.startsWith("audio/")) && !a.deletedAt,
    );
    if (
      audioTrack &&
      audioTrack.type === "audio" &&
      audioTrack.clips.length === 0 &&
      audioAsset
    ) {
      const dur = Math.max(5000, proposal.durationMs || 30_000);
      proposalToApply = {
        ...proposal,
        tracks: proposal.tracks.map((t) =>
          t.type === "audio"
            ? {
                ...t,
                clips: [
                  {
                    id: `aud-${Date.now()}`,
                    assetId: audioAsset.id,
                    srcStartMs: 0,
                    srcEndMs: dur,
                    timelineStartMs: 0,
                    label: audioAsset.name || "Background Music",
                  },
                ],
              }
            : t,
        ),
      };
    }

    // Apply → local draft (FR-ED-006); then save if timeline exists
    hydrate(state.timelineId ?? pendingTimelineId, proposalToApply);

    let timelineId = state.timelineId ?? pendingTimelineId;
    setActionPending(true);
    setError(null);
    try {
      if (!timelineId) {
        const created = await createProjectTimeline(projectId, proposalToApply);
        timelineId = created.id;
        hydrate(timelineId, created.content ?? proposalToApply);
        markClean(timelineId);
        setProposal(null);
        setTimelines((prev) => [created, ...prev]);
      } else {
        const saved = await saveTimeline(timelineId, proposalToApply);
        hydrate(saved.id || timelineId, saved.content ?? proposalToApply);
        markClean(saved.id || timelineId);
        setProposal(null);
        setTimelines((prev) => {
          const others = prev.filter((t) => t.id !== (saved.id || timelineId));
          return [saved, ...others];
        });
      }
    } catch (err) {
      hydrate(timelineId ?? null, proposalToApply);
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

  const onSequenceSceneClips = useCallback(() => {
    if (fulfilledScenes.length === 0) {
      setError(
        "No clips are attached to script scenes yet. Upload footage in Footage & Scenes first.",
      );
      return;
    }
    const autoSequenced = buildSceneSequenceDraft(
      fulfilledScenes,
      assets,
      state.draft,
    );
    replaceDraft(autoSequenced);
  }, [fulfilledScenes, assets, state.draft, replaceDraft]);

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
            <span className="rounded bg-[var(--brand)]/5 border border-[var(--brand)]/20 px-2 py-0.5 text-xs font-medium text-[var(--brand)]">
              {assetIds.length} attached asset{assetIds.length === 1 ? "" : "s"}
            </span>
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
            {" · "}{assetIds.length} asset{assetIds.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {fulfilledScenes.length > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={onSequenceSceneClips}
              className="rounded-md border border-[var(--brand)] bg-[var(--brand)]/10 px-3 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/20 transition disabled:opacity-40"
              title="Auto-sequence clips from script scenes onto the video track"
            >
              Auto-sequence scene clips ({fulfilledScenes.length})
            </button>
          ) : null}
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
        assets={assets}
        onSuggest={() => void onSuggest()}
        onApply={() => void onApplyProposal()}
        onApplyAudio={(audioAsset) => void onApplyAudio(audioAsset)}
        onApplyCaptionsAndText={() => void onApplyCaptionsAndText()}
      />

      {/* Layout: bin | preview | tracks | inspector */}
      <div className="grid gap-3 lg:grid-cols-[14rem_minmax(0,1.2fr)_minmax(0,1fr)_16rem] lg:items-stretch">
        <div className="min-h-[16rem] lg:min-h-[28rem]">
          <MediaBin
            assets={projectMedia}
            loading={loading}
            fulfilledScenesCount={fulfilledScenes.length}
            onSequenceScenes={onSequenceSceneClips}
          />
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
          <TracksPanel
            fulfilledScenesCount={fulfilledScenes.length}
            onSequenceScenes={onSequenceSceneClips}
          />
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
