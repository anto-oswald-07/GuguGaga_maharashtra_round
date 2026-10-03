"use client";

import { FormEvent, useState } from "react";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  type Platform,
} from "@/components/projects/constants";
import type { GenerateScriptPayload, ScriptPlatform } from "@/lib/api";

type ScriptGenerateFormProps = {
  initialPlatform?: Platform | ScriptPlatform | null;
  pending?: boolean;
  onGenerate: (payload: GenerateScriptPayload) => void;
};

const TONE_PRESETS = [
  "Practical and energetic",
  "Friendly and conversational",
  "Authoritative expert",
  "Witty and light",
] as const;

export function ScriptGenerateForm({
  initialPlatform,
  pending,
  onGenerate,
}: ScriptGenerateFormProps) {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<string>(TONE_PRESETS[0]);
  const [platform, setPlatform] = useState<ScriptPlatform>(
    (initialPlatform as ScriptPlatform | undefined) ?? "INSTAGRAM_REELS",
  );
  const [localError, setLocalError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!topic.trim() || !audience.trim() || !tone.trim()) {
      setLocalError("Topic, audience, and tone are required.");
      return;
    }
    setLocalError(null);
    onGenerate({
      topic: topic.trim(),
      audience: audience.trim(),
      tone: tone.trim(),
      platform,
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div>
        <h2 className="text-sm font-semibold">Generate script</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Topic, audience, tone, and platform → AI job.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Topic</span>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={pending}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          placeholder="How I batch-create Reels in one afternoon"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Audience</span>
        <input
          type="text"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          disabled={pending}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          placeholder="Solo creators building a weekly system"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Tone</span>
        <input
          type="text"
          list="script-tone-presets"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          disabled={pending}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
        />
        <datalist id="script-tone-presets">
          {TONE_PRESETS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Platform</span>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as ScriptPlatform)}
          disabled={pending}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      {localError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {localError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate"}
      </button>
    </form>
  );
}
