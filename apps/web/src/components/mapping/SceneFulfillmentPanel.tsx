"use client";

import { useRef, useState } from "react";
import {
  ApiError,
  fulfillScene,
  formatTimecode,
  generateScene,
  matchScenes,
  reviewFootage,
  transcribeProjectAsset,
  uploadAsset,
  type Asset,
  type ScriptDocument,
  type ScriptScene,
} from "@/lib/api";
import { attachProjectAssets } from "@/components/projects/project-api";

type SceneFulfillmentPanelProps = {
  projectId: string;
  script: ScriptDocument | null;
  assets: Asset[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onStartJob: (
    label: string,
    runner: () => Promise<{ jobId: string }>,
  ) => Promise<void>;
  onError: (message: string | null) => void;
  onRefreshed: () => Promise<void>;
  onAssetsAttached?: () => void;
};

function modeBadge(mode: ScriptScene["fulfillment"]["mode"]): string {
  switch (mode) {
    case "UPLOAD":
      return "Uploaded";
    case "AI_GENERATED":
      return "AI";
    case "TRIMMED":
      return "Trimmed";
    default:
      return "Empty";
  }
}

function assetName(assets: Asset[], assetId?: string): string {
  if (!assetId) return "—";
  return assets.find((a) => a.id === assetId)?.name ?? assetId.slice(0, 8);
}

export function SceneFulfillmentPanel({
  projectId,
  script,
  assets,
  busy,
  onBusyChange,
  onStartJob,
  onError,
  onRefreshed,
  onAssetsAttached,
}: SceneFulfillmentPanelProps) {
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingSceneId, setUploadingSceneId] = useState<string | null>(null);

  const scenes = script?.content?.scenes ?? [];
  const scriptId = script?.id ?? "";

  async function onUploadForScene(scene: ScriptScene, file: File) {
    if (!scriptId) {
      onError("Select a script with scenes first.");
      return;
    }
    onError(null);
    onBusyChange(true);
    setUploadingSceneId(scene.id);
    try {
      const uploaded = await uploadAsset(file, {
        name: file.name,
        tags: `scene,${scene.beatType.toLowerCase()}`,
      });
      await attachProjectAssets(projectId, [uploaded.id]);
      onAssetsAttached?.();
      await fulfillScene(projectId, {
        scriptId,
        sceneId: scene.id,
        assetId: uploaded.id,
      });
      await onStartJob("Transcribe scene footage", () =>
        transcribeProjectAsset(projectId, { assetId: uploaded.id }),
      );
      await onRefreshed();
    } catch (err) {
      onError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Upload / fulfill failed",
      );
    } finally {
      setUploadingSceneId(null);
      onBusyChange(false);
    }
  }

  async function onGenerate(scene: ScriptScene) {
    if (!scriptId) {
      onError("Select a script with scenes first.");
      return;
    }
    await onStartJob(`Generate scene: ${scene.title}`, () =>
      generateScene(projectId, { scriptId, sceneId: scene.id }),
    );
  }

  async function onReviewAll() {
    if (!scriptId) {
      onError("Select a script first.");
      return;
    }
    await onStartJob("AI review footage", () =>
      reviewFootage(projectId, { scriptId }),
    );
  }

  async function onMatchAll() {
    if (!scriptId) {
      onError("Select a script first.");
      return;
    }
    await onStartJob("Auto-trim to plan", () =>
      matchScenes(projectId, { scriptId }),
    );
  }

  if (!script) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="text-sm font-semibold">Scene checklist</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Generate a script first — scenes become the production checklist here.
        </p>
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="text-sm font-semibold">Scene checklist</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This script has no scenes yet. Open the Script tab and generate (or
          re-save) so production beats are derived from hook / body / CTA.
        </p>
      </div>
    );
  }

  const filled = scenes.filter((s) => s.fulfillment.mode !== "EMPTY").length;

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Fill scenes</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {filled}/{scenes.length} filled — upload real footage or generate an
            AI placeholder per beat, then review and auto-trim.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || filled === 0}
            onClick={() => void onReviewAll()}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
          >
            AI review all
          </button>
          <button
            type="button"
            disabled={busy || filled === 0}
            onClick={() => void onMatchAll()}
            className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Auto-trim to plan
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {scenes.map((scene) => {
          const empty = scene.fulfillment.mode === "EMPTY";
          const sceneBusy = uploadingSceneId === scene.id;
          return (
            <li
              key={scene.id}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-[var(--muted)]">
                      #{scene.ordinal + 1}
                    </span>
                    <span className="font-medium">{scene.title}</span>
                    <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs uppercase tracking-wide text-[var(--muted)]">
                      {scene.beatType}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {modeBadge(scene.fulfillment.mode)}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--foreground)] line-clamp-2">
                    {scene.spokenText}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Target {formatTimecode(scene.targetDurationMs)}
                    {!empty
                      ? ` · ${assetName(assets, scene.fulfillment.assetId)}`
                      : ""}
                    {typeof scene.fulfillment.matchConfidence === "number"
                      ? ` · ${Math.round(scene.fulfillment.matchConfidence * 100)}% match`
                      : ""}
                  </p>
                  {scene.fulfillment.opinion ? (
                    <p className="text-xs text-[var(--muted)]">
                      {scene.fulfillment.opinion}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    ref={(el) => {
                      fileRefs.current[scene.id] = el;
                    }}
                    type="file"
                    accept="video/*,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void onUploadForScene(scene, file);
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy || sceneBusy}
                    onClick={() => fileRefs.current[scene.id]?.click()}
                    className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-sm disabled:opacity-40"
                  >
                    {sceneBusy ? "Uploading…" : empty ? "Upload" : "Replace"}
                  </button>
                  {empty ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onGenerate(scene)}
                      className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-sm disabled:opacity-40"
                    >
                      Generate
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
