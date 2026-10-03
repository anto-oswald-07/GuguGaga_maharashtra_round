"use client";

import { useState } from "react";
import {
  ASPECT_RATIO_LABELS,
  DEFAULT_ASPECT_BY_PLATFORM,
  PLATFORMS,
  PLATFORM_LABELS,
  type AspectRatio,
  type Platform,
} from "@/components/packs/constants";

type PackGenerateFormProps = {
  /** Pre-select from project.targetPlatforms when available. */
  defaultPlatforms?: Platform[];
  pending?: boolean;
  onGenerate: (platforms: Platform[], aspectRatios: AspectRatio[]) => void;
};

function initialSelection(defaultPlatforms: Platform[]): Set<Platform> {
  if (defaultPlatforms.length > 0) return new Set(defaultPlatforms);
  return new Set<Platform>(["YOUTUBE", "YOUTUBE_SHORTS"]);
}

export function PackGenerateForm({
  defaultPlatforms = [],
  pending,
  onGenerate,
}: PackGenerateFormProps) {
  const [selected, setSelected] = useState(() =>
    initialSelection(defaultPlatforms),
  );

  function toggle(platform: Platform) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  function onSubmit() {
    const platforms = PLATFORMS.filter((p) => selected.has(p));
    if (platforms.length === 0) return;
    const aspectRatios = platforms.map((p) => DEFAULT_ASPECT_BY_PLATFORM[p]);
    onGenerate(platforms, aspectRatios);
  }

  const count = selected.size;

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <h3 className="text-sm font-semibold">Generate packs</h3>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Select platforms → ADAPT_PLATFORM job creates aspect + copy per pack.
        </p>
      </div>

      <fieldset className="space-y-2" disabled={pending}>
        <legend className="text-sm font-medium">Platforms</legend>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => {
            const checked = selected.has(platform);
            const aspect = DEFAULT_ASPECT_BY_PLATFORM[platform];
            return (
              <label
                key={platform}
                className={
                  checked
                    ? "inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--brand)] bg-white px-3 py-1.5 text-sm"
                    : "inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-[var(--muted)]"
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(platform)}
                  className="accent-[var(--brand)]"
                />
                <span>
                  {PLATFORM_LABELS[platform]}
                  <span className="ml-1 text-xs text-[var(--muted)]">
                    ({ASPECT_RATIO_LABELS[aspect]})
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        disabled={pending || count === 0}
        onClick={onSubmit}
        className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        Generate packs ({count})
      </button>
    </div>
  );
}
