"use client";

import type { ScriptContent } from "@/lib/api";
import { ScriptSceneChecklist } from "@/components/scripts/ScriptSceneChecklist";

type ScriptDisplayProps = {
  content: ScriptContent;
  editable?: boolean;
  onChange?: (content: ScriptContent) => void;
};

export function ScriptDisplay({
  content,
  editable = false,
  onChange,
}: ScriptDisplayProps) {
  function update(field: "hook" | "body" | "cta", value: string) {
    onChange?.({ ...content, [field]: value });
  }

  if (editable) {
    return (
      <div className="space-y-5">
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Hook</span>
            <textarea
              value={content.hook}
              onChange={(e) => update("hook", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Body</span>
            <textarea
              value={content.body}
              onChange={(e) => update("body", e.target.value)}
              rows={8}
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">CTA</span>
            <textarea
              value={content.cta}
              onChange={(e) => update("cta", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <ScriptSceneChecklist
          content={content}
          editable
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Hook
        </h3>
        <p className="mt-1 whitespace-pre-wrap text-[var(--foreground)]">
          {content.hook || "—"}
        </p>
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Body
        </h3>
        <p className="mt-1 whitespace-pre-wrap text-[var(--foreground)]">
          {content.body || "—"}
        </p>
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          CTA
        </h3>
        <p className="mt-1 whitespace-pre-wrap text-[var(--foreground)]">
          {content.cta || "—"}
        </p>
      </section>
      <ScriptSceneChecklist content={content} />
    </div>
  );
}
