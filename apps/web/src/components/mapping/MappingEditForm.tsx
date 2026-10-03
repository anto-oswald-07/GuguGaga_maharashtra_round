"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  formatTimecode,
  type ScriptFootageMapDto,
  type UpdateMappingPayload,
} from "@/lib/api";

type MappingEditFormProps = {
  mapping: ScriptFootageMapDto | null;
  pending?: boolean;
  onSave: (payload: UpdateMappingPayload) => void;
  onCancel: () => void;
};

export function MappingEditForm({
  mapping,
  pending,
  onSave,
  onCancel,
}: MappingEditFormProps) {
  const [scriptRef, setScriptRef] = useState("");
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapping) return;
    const t = window.setTimeout(() => {
      setScriptRef(mapping.scriptRef);
      setStartMs(mapping.startMs);
      setEndMs(mapping.endMs);
      setLocalError(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [mapping]);

  if (!mapping) return null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (endMs < startMs) {
      setLocalError("End must be ≥ start.");
      return;
    }
    if (!scriptRef.trim()) {
      setLocalError("Script section is required.");
      return;
    }
    setLocalError(null);
    onSave({
      scriptRef: scriptRef.trim(),
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
        <h3 className="text-sm font-semibold">Edit mapping</h3>
        <span className="font-mono text-xs text-[var(--muted)]">
          {formatTimecode(mapping.startMs)} → {formatTimecode(mapping.endMs)}
        </span>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Script section</span>
        <textarea
          value={scriptRef}
          onChange={(e) => setScriptRef(e.target.value)}
          rows={3}
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
          {pending ? "Saving…" : "Save correction"}
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
