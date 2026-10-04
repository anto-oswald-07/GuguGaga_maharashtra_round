"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ApiError,
  buildClipPrompt,
  formatAllScenePrompts,
  fulfillScene,
  formatTimecode,
  reviewFootage,
  transcribeProjectAsset,
  uploadAsset,
  type Asset,
  type ScriptDocument,
  type ScriptScene,
  type ClipPromptStyle,
  type ClipPromptCamera,
  STYLE_LABELS,
  CAMERA_LABELS,
} from "@/lib/api";
import { attachProjectAssets } from "@/components/projects/project-api";
import { ClipPlayer } from "@/components/assets/ClipPlayer";

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

  // Clip preview state (toggle playback of uploaded clip per scene)
  const [previewClipSceneIds, setPreviewClipSceneIds] = useState<Record<string, boolean>>({});

  // Clip prompt management
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});
  const [promptConfigs, setPromptConfigs] = useState<
    Record<
      string,
      {
        prompt: string;
        style: ClipPromptStyle;
        camera: ClipPromptCamera;
        dirty?: boolean;
      }
    >
  >({});
  const [copiedSceneId, setCopiedSceneId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  function toggleClipPreview(sceneId: string) {
    setPreviewClipSceneIds((prev) => ({
      ...prev,
      [sceneId]: !prev[sceneId],
    }));
  }

  const scenes = script?.content?.scenes ?? [];
  const scriptId = script?.id ?? "";

  function getScenePromptConfig(scene: ScriptScene) {
    const existing = promptConfigs[scene.id];
    if (existing) return existing;
    const defaultStyle: ClipPromptStyle = "cinematic";
    const defaultCamera: ClipPromptCamera =
      scene.beatType === "HOOK"
        ? "push-in"
        : scene.beatType === "CTA"
          ? "orbit"
          : "dynamic";
    const initialPrompt = buildClipPrompt({
      title: scene.title,
      spokenText: scene.spokenText,
      beatType: scene.beatType,
      visualBrief: scene.visualBrief,
      targetDurationMs: scene.targetDurationMs,
      scriptTopic: script?.topic,
      style: defaultStyle,
      camera: defaultCamera,
    });
    return {
      prompt: initialPrompt,
      style: defaultStyle,
      camera: defaultCamera,
    };
  }

  function togglePrompt(sceneId: string) {
    setExpandedPrompts((prev) => ({
      ...prev,
      [sceneId]: !prev[sceneId],
    }));
  }

  function handleStyleChange(scene: ScriptScene, newStyle: ClipPromptStyle) {
    const current = getScenePromptConfig(scene);
    const newPrompt = buildClipPrompt({
      title: scene.title,
      spokenText: scene.spokenText,
      beatType: scene.beatType,
      visualBrief: scene.visualBrief,
      targetDurationMs: scene.targetDurationMs,
      scriptTopic: script?.topic,
      style: newStyle,
      camera: current.camera,
    });
    setPromptConfigs((prev) => ({
      ...prev,
      [scene.id]: {
        ...current,
        style: newStyle,
        prompt: newPrompt,
        dirty: false,
      },
    }));
  }

  function handleCameraChange(scene: ScriptScene, newCamera: ClipPromptCamera) {
    const current = getScenePromptConfig(scene);
    const newPrompt = buildClipPrompt({
      title: scene.title,
      spokenText: scene.spokenText,
      beatType: scene.beatType,
      visualBrief: scene.visualBrief,
      targetDurationMs: scene.targetDurationMs,
      scriptTopic: script?.topic,
      style: current.style,
      camera: newCamera,
    });
    setPromptConfigs((prev) => ({
      ...prev,
      [scene.id]: {
        ...current,
        camera: newCamera,
        prompt: newPrompt,
        dirty: false,
      },
    }));
  }

  function handlePromptTextChange(sceneId: string, text: string) {
    setPromptConfigs((prev) => {
      const current = prev[sceneId] ?? {
        prompt: text,
        style: "cinematic" as ClipPromptStyle,
        camera: "dynamic" as ClipPromptCamera,
      };
      return {
        ...prev,
        [sceneId]: {
          ...current,
          prompt: text,
          dirty: true,
        },
      };
    });
  }

  function handleResetPrompt(scene: ScriptScene) {
    const current = getScenePromptConfig(scene);
    const freshPrompt = buildClipPrompt({
      title: scene.title,
      spokenText: scene.spokenText,
      beatType: scene.beatType,
      visualBrief: scene.visualBrief,
      targetDurationMs: scene.targetDurationMs,
      scriptTopic: script?.topic,
      style: current.style,
      camera: current.camera,
    });
    setPromptConfigs((prev) => ({
      ...prev,
      [scene.id]: {
        ...current,
        prompt: freshPrompt,
        dirty: false,
      },
    }));
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      return true;
    } catch {
      return false;
    }
  }

  async function handleCopyPrompt(scene: ScriptScene) {
    const config = getScenePromptConfig(scene);
    const ok = await copyText(config.prompt);
    if (ok) {
      setCopiedSceneId(scene.id);
      window.setTimeout(() => setCopiedSceneId(null), 2000);
    }
  }

  async function handleCopyAllPrompts() {
    if (scenes.length === 0) return;
    const text = formatAllScenePrompts(scenes, script?.topic);
    const ok = await copyText(text);
    if (ok) {
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2500);
    }
  }

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
      setPreviewClipSceneIds((prev) => ({
        ...prev,
        [scene.id]: true,
      }));
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

  async function onReviewAll() {
    if (!scriptId) {
      onError("Select a script first.");
      return;
    }
    await onStartJob("AI review footage", () =>
      reviewFootage(projectId, { scriptId }),
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
            {filled}/{scenes.length} filled — view AI clip prompts, upload footage for each scene beat, and review coverage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scenes.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleCopyAllPrompts()}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-slate-50 transition"
              title="Copy all scene video generation prompts as a formatted list"
            >
              {copiedAll ? "Copied all prompts!" : "Copy all clip prompts"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || filled === 0}
            onClick={() => void onReviewAll()}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
          >
            AI review all
          </button>
        </div>
      </div>

      {filled === scenes.length && scenes.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <div>
              <p className="text-sm font-medium text-emerald-950">
                All {scenes.length} scene clips uploaded!
              </p>
              <p className="text-xs text-emerald-800">
                Ready to assemble and edit in the Timeline Editor.
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

      <ul className="space-y-3">
        {scenes.map((scene) => {
          const empty = scene.fulfillment.mode === "EMPTY";
          const sceneBusy = uploadingSceneId === scene.id;
          const isPromptOpen = Boolean(expandedPrompts[scene.id]);
          const isClipPreviewOpen = Boolean(previewClipSceneIds[scene.id]);
          const promptConfig = getScenePromptConfig(scene);
          const attachedAsset = assets.find((a) => a.id === scene.fulfillment.assetId);

          return (
            <li
              key={scene.id}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-3 transition"
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

                <div className="flex flex-wrap items-center gap-2">
                  {!empty && scene.fulfillment.assetId ? (
                    <button
                      type="button"
                      onClick={() => toggleClipPreview(scene.id)}
                      className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium transition ${
                        isClipPreviewOpen
                          ? "border-emerald-600 bg-emerald-600 text-white shadow-xs"
                          : "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                      }`}
                      title="View the clip uploaded for this scene"
                    >
                      {isClipPreviewOpen ? "Hide Clip" : "View Clip"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => togglePrompt(scene.id)}
                    className={`rounded-md border px-2.5 py-1 text-sm font-medium transition ${
                      isPromptOpen
                        ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-xs"
                        : "border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-slate-50"
                    }`}
                    title="View or customize AI prompt to generate this clip"
                  >
                    Clip Prompt
                  </button>

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
                </div>
              </div>

              {/* Uploaded Clip Video Player Preview */}
              {isClipPreviewOpen && scene.fulfillment.assetId ? (
                <div className="mt-3.5">
                  <ClipPlayer
                    assetId={scene.fulfillment.assetId}
                    title={`${scene.title} — ${assetName(assets, scene.fulfillment.assetId)}`}
                    type={attachedAsset?.type ?? "VIDEO"}
                    mime={attachedAsset?.mime}
                    onClose={() => toggleClipPreview(scene.id)}
                  />
                </div>
              ) : null}

              {/* Expandable Clip Generation Prompt Card */}
              {isPromptOpen ? (
                <div className="mt-3.5 rounded-lg border border-[var(--brand)]/20 bg-slate-50/90 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[var(--foreground)] tracking-wide uppercase">
                        AI Prompt to Generate Clip
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--muted)]">
                      For Runway Gen-3 · Kling · Sora · Pika · Midjourney
                    </span>
                  </div>

                  {/* Style Pills & Camera Selector */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-[var(--muted)] mr-1">Style:</span>
                      {(Object.keys(STYLE_LABELS) as ClipPromptStyle[]).map((st) => {
                        const active = promptConfig.style === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleStyleChange(scene, st)}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                              active
                                ? "bg-[var(--brand)] text-white shadow-xs"
                                : "bg-white border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-slate-50"
                            }`}
                          >
                            {STYLE_LABELS[st].icon} {STYLE_LABELS[st].label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[var(--muted)] font-medium">Camera:</span>
                      <select
                        value={promptConfig.camera}
                        onChange={(e) =>
                          handleCameraChange(scene, e.target.value as ClipPromptCamera)
                        }
                        className="rounded border border-[var(--border)] bg-white px-2 py-0.5 text-xs font-medium text-[var(--foreground)] outline-none"
                      >
                        {(Object.keys(CAMERA_LABELS) as ClipPromptCamera[]).map((cam) => (
                          <option key={cam} value={cam}>
                            {CAMERA_LABELS[cam]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Prompt Textarea */}
                  <div className="relative">
                    <textarea
                      value={promptConfig.prompt}
                      onChange={(e) => handlePromptTextChange(scene.id, e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-[var(--border)] bg-white p-2.5 text-xs font-mono text-[var(--foreground)] leading-relaxed shadow-inner outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]"
                      placeholder="Video generation prompt for this scene..."
                    />
                    {promptConfig.dirty ? (
                      <span className="absolute bottom-2 right-2 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Customized
                      </span>
                    ) : null}
                  </div>

                  {/* Prompt Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border)]/60">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyPrompt(scene)}
                        className="flex items-center gap-1 rounded-md bg-[var(--brand)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 transition shadow-xs"
                      >
                        {copiedSceneId === scene.id ? "Copied to clipboard!" : "Copy Prompt"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetPrompt(scene)}
                        className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition underline"
                      >
                        Reset to default
                      </button>
                    </div>

                    <p className="text-[11px] text-[var(--muted)]">
                      Paste into Runway, Kling, Sora, or Pika, then click <strong>Upload</strong> above to attach your clip.
                    </p>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
