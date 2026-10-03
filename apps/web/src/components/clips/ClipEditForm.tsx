"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  formatTimecode,
  type ClipCandidateDto,
  type UpdateClipCandidatePayload,
} from "@/lib/api";

type ClipEditFormProps = {
  candidate: ClipCandidateDto | null;
  pending?: boolean;
  onSave: (payload: UpdateClipCandidatePayload) => void;
  onCancel: () => void;
};

export function ClipEditForm({
  candidate,
  pending,
  onSave,
  onCancel,
}: ClipEditFormProps) {
  const [title, setTitle] = useState("");
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!candidate) return;
    const t = window.setTimeout(() => {
      setTitle(candidate.title);
      setStartMs(candidate.startMs);
      setEndMs(candidate.endMs);
      setLocalError(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [candidate]);

  if (!candidate) return null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (endMs < startMs) {
      setLocalError("End must be ≥ start.");
      return;
    }
    if (!title.trim()) {
      setLocalError("Title is required.");
      return;
    }
    setLocalError(null);
    onSave({
      title: title.trim(),
      startMs,
      endMs,
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Tweak clip boundaries</h3>
        <span className="font-mono text-xs text-[var(--muted)]">
          {formatTimecode(candidate.startMs)} → {formatTimecode(candidate.endMs)}
        </span>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={pending}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Start (ms)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={startMs}
            onChange={(e) => setStartMs(Number(e.target.value))}
            disabled={pending}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">End (ms)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={endMs}
            onChange={(e) => setEndMs(Number(e.target.value))}
            disabled={pending}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {localError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {localError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save boundaries"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
