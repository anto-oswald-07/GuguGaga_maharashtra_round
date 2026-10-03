"use client";

import type { ScriptContent, ScriptScene } from "@/lib/api";
import { formatTimecode } from "@/lib/api";

type ScriptSceneChecklistProps = {
  content: ScriptContent;
  editable?: boolean;
  onChange?: (content: ScriptContent) => void;
};

function modeLabel(mode: ScriptScene["fulfillment"]["mode"]): string {
  switch (mode) {
    case "UPLOAD":
      return "Uploaded";
    case "AI_GENERATED":
      return "AI filled";
    case "TRIMMED":
      return "Trimmed";
    default:
      return "Empty";
  }
}

export function ScriptSceneChecklist({
  content,
  editable = false,
  onChange,
}: ScriptSceneChecklistProps) {
  const scenes = content.scenes ?? [];

  function updateScene(index: number, patch: Partial<ScriptScene>) {
    if (!onChange) return;
    const next = scenes.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...content, scenes: next });
  }

  if (scenes.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--muted)]">
        No production scenes yet. Generate a script to create a scene checklist
        (hook → points → CTA) for the Footage tab.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Production scenes ({scenes.length})
        </h3>
        <p className="text-xs text-[var(--muted)]">
          Fulfill these on Footage &amp; Mapping
        </p>
      </div>
      <ol className="space-y-3">
        {scenes.map((scene, index) => (
          <li
            key={scene.id}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-[var(--muted)]">
                  #{scene.ordinal + 1}
                </span>
                <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  {scene.beatType}
                </span>
                <span className="rounded px-1.5 py-0.5 text-xs text-[var(--muted)]">
                  {modeLabel(scene.fulfillment.mode)}
                </span>
              </div>
              <span className="font-mono text-xs text-[var(--muted)]">
                ~{formatTimecode(scene.targetDurationMs)}
              </span>
            </div>

            {editable ? (
              <div className="mt-2 space-y-2">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Title</span>
                  <input
                    value={scene.title}
                    onChange={(e) =>
                      updateScene(index, { title: e.target.value })
                    }
                    className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Spoken / shown</span>
                  <textarea
                    value={scene.spokenText}
                    onChange={(e) =>
                      updateScene(index, { spokenText: e.target.value })
                    }
                    rows={2}
                    className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Visual brief</span>
                  <textarea
                    value={scene.visualBrief}
                    onChange={(e) =>
                      updateScene(index, { visualBrief: e.target.value })
                    }
                    rows={2}
                    className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Target duration (ms)</span>
                  <input
                    type="number"
                    min={1000}
                    step={500}
                    value={scene.targetDurationMs}
                    onChange={(e) =>
                      updateScene(index, {
                        targetDurationMs: Math.max(
                          1000,
                          Number(e.target.value) || 1000,
                        ),
                      })
                    }
                    className="w-full max-w-[12rem] rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            ) : (
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-medium text-[var(--foreground)]">
                  {scene.title}
                </p>
                <p className="whitespace-pre-wrap text-[var(--foreground)]">
                  {scene.spokenText || "—"}
                </p>
                {scene.visualBrief ? (
                  <p className="text-xs text-[var(--muted)]">
                    {scene.visualBrief}
                  </p>
                ) : null}
              </div>
            )}

            {scene.fulfillment.opinion ? (
              <p className="mt-2 border-t border-[var(--border)] pt-2 text-xs text-[var(--muted)]">
                Director: {scene.fulfillment.opinion}
                {typeof scene.fulfillment.matchConfidence === "number"
                  ? ` (${Math.round(scene.fulfillment.matchConfidence * 100)}%)`
                  : ""}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
