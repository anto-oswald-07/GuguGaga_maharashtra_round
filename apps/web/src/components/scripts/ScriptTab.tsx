"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  generateProjectScript,
  generateScriptHooks,
  generateScriptSupporting,
  getScript,
  listProjectScripts,
  refineScript,
  saveScriptVersion,
  type GenerateScriptPayload,
  type Job,
  type ScriptContent,
  type ScriptDocument,
  type ScriptPlatform,
  type ScriptVersion,
  type SupportingContent,
} from "@/lib/api";
import { JobStatusBanner } from "@/components/scripts/JobStatusBanner";
import { ScriptDisplay } from "@/components/scripts/ScriptDisplay";
import { ScriptGenerateForm } from "@/components/scripts/ScriptGenerateForm";
import { ScriptVersionList } from "@/components/scripts/ScriptVersionList";
import { useJobPoll } from "@/components/scripts/useJobPoll";

type ScriptTabProps = {
  projectId: string;
  defaultPlatform?: ScriptPlatform | null;
};

function emptyContent(): ScriptContent {
  return { hook: "", body: "", cta: "" };
}

function isScriptContent(value: unknown): value is ScriptContent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.hook === "string" &&
    typeof v.body === "string" &&
    typeof v.cta === "string"
  );
}

/** Best-effort extract structured script from job.output (Anto/Arvin may nest differently). */
function contentFromJobOutput(output: unknown): ScriptContent | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  if (isScriptContent(o)) return o;
  if (isScriptContent(o.content)) return o.content;
  if (isScriptContent(o.script)) return o.script;
  if (o.result && typeof o.result === "object") {
    const r = o.result as Record<string, unknown>;
    if (isScriptContent(r)) return r;
    if (isScriptContent(r.content)) return r.content;
  }
  return null;
}

function scriptIdFromJob(job: Job, fallback?: string | null): string | null {
  if (fallback) return fallback;
  const output = job.output;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.scriptId === "string") return o.scriptId;
  }
  const input = job.input;
  if (input && typeof input === "object") {
    const i = input as Record<string, unknown>;
    if (typeof i.scriptId === "string") return i.scriptId;
  }
  return null;
}

function hooksFromUnknown(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value) && value.every((h) => typeof h === "string")) {
    return value;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.hooks) && o.hooks.every((h) => typeof h === "string")) {
      return o.hooks as string[];
    }
  }
  return null;
}

function supportingFromUnknown(value: unknown): SupportingContent | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const src =
    o.supporting && typeof o.supporting === "object"
      ? (o.supporting as Record<string, unknown>)
      : o;
  const titles = Array.isArray(src.titles) ? src.titles.filter((t) => typeof t === "string") : [];
  const captions = Array.isArray(src.captions)
    ? src.captions.filter((t) => typeof t === "string")
    : [];
  const hashtags = Array.isArray(src.hashtags)
    ? src.hashtags.filter((t) => typeof t === "string")
    : [];
  if (titles.length === 0 && captions.length === 0 && hashtags.length === 0) {
    return null;
  }
  return {
    titles: titles as string[],
    captions: captions as string[],
    hashtags: hashtags as string[],
    description:
      typeof src.description === "string" || src.description === null
        ? (src.description as string | null)
        : null,
  };
}

export function ScriptTab({ projectId, defaultPlatform }: ScriptTabProps) {
  const [scripts, setScripts] = useState<ScriptDocument[]>([]);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScriptContent>(emptyContent());
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [hooks, setHooks] = useState<string[]>([]);
  const [supporting, setSupporting] = useState<SupportingContent | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobLabel, setJobLabel] = useState("Generation job");
  const [pendingScriptId, setPendingScriptId] = useState<string | null>(null);

  const activeScript = useMemo(
    () => scripts.find((s) => s.id === activeScriptId) ?? scripts[0] ?? null,
    [scripts, activeScriptId],
  );

  const applyScript = useCallback((script: ScriptDocument) => {
    setActiveScriptId(script.id);
    const latest =
      script.content ??
      (script.versions.length > 0
        ? [...script.versions].sort((a, b) => b.version - a.version)[0]?.content
        : null);
    setDraft(latest ?? emptyContent());
    setActiveVersionId(
      script.versions.length > 0
        ? [...script.versions].sort((a, b) => b.version - a.version)[0]?.id ??
            null
        : null,
    );
    setHooks(script.hooks ?? []);
    setSupporting(script.supporting ?? null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listProjectScripts(projectId);
      const items = result.items ?? [];
      setScripts(items);
      if (items.length === 0) {
        setActiveScriptId(null);
        setDraft(emptyContent());
        setHooks([]);
        setSupporting(null);
        return;
      }
      const preferred =
        items.find((s) => s.id === activeScriptId) ?? items[0];
      if (preferred) applyScript(preferred);
    } catch (err) {
      setScripts([]);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load scripts",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, activeScriptId, applyScript]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
    // intentionally load once per projectId mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const onJobTerminal = useCallback(
    async (job: Job) => {
      if (job.status === "FAILED") {
        setError(job.error || "Job failed");
        return;
      }

      const fromOutput = contentFromJobOutput(job.output);
      if (fromOutput) setDraft(fromOutput);

      const hooksOut = hooksFromUnknown(job.output);
      if (hooksOut) setHooks(hooksOut);

      const supportingOut = supportingFromUnknown(job.output);
      if (supportingOut) setSupporting(supportingOut);

      const sid = scriptIdFromJob(job, pendingScriptId);
      if (sid) {
        try {
          const script = await getScript(sid);
          setScripts((prev) => {
            const others = prev.filter((s) => s.id !== script.id);
            return [script, ...others];
          });
          applyScript(script);
        } catch {
          await refresh();
        }
      } else {
        await refresh();
      }
      setPendingScriptId(null);
    },
    [pendingScriptId, applyScript, refresh],
  );

  const { job, error: pollError, polling } = useJobPoll(jobId, {
    onTerminal: (j) => {
      void onJobTerminal(j);
    },
  });

  async function startJob(
    label: string,
    runner: () => Promise<{ jobId: string; scriptId?: string } | { hooks: string[] } | { supporting: SupportingContent }>,
  ) {
    setError(null);
    setActionPending(true);
    setJobLabel(label);
    try {
      const result = await runner();
      if ("jobId" in result && result.jobId) {
        if (result.scriptId) setPendingScriptId(result.scriptId);
        setJobId(result.jobId);
      } else if ("hooks" in result) {
        setHooks(result.hooks);
      } else if ("supporting" in result) {
        setSupporting(result.supporting);
      }
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

  async function onGenerate(payload: GenerateScriptPayload) {
    await startJob("Generate script", () =>
      generateProjectScript(projectId, payload),
    );
  }

  async function onRefine() {
    if (!activeScript) {
      setError("Generate or load a script before refining.");
      return;
    }
    if (!refineInstruction.trim()) {
      setError("Enter a refine instruction.");
      return;
    }
    const instruction = refineInstruction.trim();
    await startJob("Refine script", () =>
      refineScript(activeScript.id, { instruction }),
    );
    setRefineInstruction("");
  }

  async function onHooks() {
    if (!activeScript) {
      setError("Generate or load a script before creating hooks.");
      return;
    }
    await startJob("Generate hooks", () =>
      generateScriptHooks(activeScript.id, 5),
    );
  }

  async function onSupporting() {
    if (!activeScript) {
      setError("Generate or load a script before supporting content.");
      return;
    }
    const platforms = activeScript.platform
      ? [activeScript.platform]
      : defaultPlatform
        ? [defaultPlatform]
        : undefined;
    await startJob("Generate supporting content", () =>
      generateScriptSupporting(activeScript.id, platforms),
    );
  }

  async function onSaveVersion() {
    if (!activeScript) {
      setError("No script document to version yet — generate first.");
      return;
    }
    if (!draft.hook.trim() && !draft.body.trim() && !draft.cta.trim()) {
      setError("Nothing to save — add hook, body, or CTA text.");
      return;
    }
    setActionPending(true);
    setError(null);
    try {
      const saved = await saveScriptVersion(activeScript.id, {
        content: draft,
        source: "MANUAL",
      });
      if ("versions" in saved) {
        applyScript(saved);
        setScripts((prev) => {
          const others = prev.filter((s) => s.id !== saved.id);
          return [saved, ...others];
        });
      } else {
        const version = saved as ScriptVersion;
        setActiveVersionId(version.id);
        setDraft(version.content);
        await refresh();
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save version failed",
      );
    } finally {
      setActionPending(false);
    }
  }

  function onSelectVersion(version: ScriptVersion) {
    setActiveVersionId(version.id);
    setDraft(version.content);
  }

  const busy = actionPending || polling;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Script</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Generate, refine, and version structured scripts (hook / body / CTA).
        </p>
      </div>

      <ScriptGenerateForm
        initialPlatform={defaultPlatform}
        pending={busy}
        onGenerate={(p) => void onGenerate(p)}
      />

      <JobStatusBanner
        job={job}
        polling={polling}
        error={pollError}
        label={jobLabel}
      />

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading scripts…</p>
      ) : null}

      {scripts.length > 1 ? (
        <label className="block max-w-md space-y-1 text-sm">
          <span className="font-medium">Script document</span>
          <select
            value={activeScript?.id ?? ""}
            onChange={(e) => {
              const next = scripts.find((s) => s.id === e.target.value);
              if (next) applyScript(next);
            }}
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

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Current script</h3>
            <button
              type="button"
              disabled={busy || !activeScript}
              onClick={() => void onSaveVersion()}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Save as new version
            </button>
          </div>
          <ScriptDisplay
            content={draft}
            editable
            onChange={setDraft}
          />

          <div className="space-y-2 border-t border-[var(--border)] pt-4">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Refine instruction</span>
              <input
                type="text"
                value={refineInstruction}
                onChange={(e) => setRefineInstruction(e.target.value)}
                disabled={busy || !activeScript}
                placeholder="Make the hook punchier; shorten CTA"
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !activeScript}
                onClick={() => void onRefine()}
                className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Refine
              </button>
              <button
                type="button"
                disabled={busy || !activeScript}
                onClick={() => void onHooks()}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Generate hooks
              </button>
              <button
                type="button"
                disabled={busy || !activeScript}
                onClick={() => void onSupporting()}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Supporting content
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-semibold">Versions</h3>
            <div className="mt-3">
              <ScriptVersionList
                versions={activeScript?.versions ?? []}
                activeVersionId={activeVersionId}
                onSelect={onSelectVersion}
              />
            </div>
          </div>
        </aside>
      </div>

      {hooks.length > 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-semibold">Hook variants</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {hooks.map((hook, i) => (
              <li key={`${i}-${hook.slice(0, 24)}`}>
                <button
                  type="button"
                  className="text-left hover:text-[var(--brand)]"
                  onClick={() => setDraft((d) => ({ ...d, hook }))}
                  title="Use as hook"
                >
                  {hook}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {supporting ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <h3 className="text-sm font-semibold">Supporting content</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <h4 className="text-xs font-semibold uppercase text-[var(--muted)]">
                Titles
              </h4>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {supporting.titles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase text-[var(--muted)]">
                Captions
              </h4>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {supporting.captions.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase text-[var(--muted)]">
                Hashtags
              </h4>
              <p className="mt-1">{supporting.hashtags.join(" ")}</p>
            </div>
          </div>
          {supporting.description ? (
            <p className="mt-3 text-[var(--muted)]">{supporting.description}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
