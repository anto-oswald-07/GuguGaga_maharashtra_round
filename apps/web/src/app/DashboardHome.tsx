"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasToken } from "@/lib/auth-storage";
import {
  ApiError,
  loadInsightsOverview,
  type InsightsCounts,
} from "@/app/insights/insights-api";

const QUICK_LINKS = [
  { href: "/projects", label: "Projects", hint: "Create & open hubs" },
  { href: "/assets", label: "Assets", hint: "Upload footage" },
  { href: "/workflow", label: "Workflow", hint: "Kanban by stage" },
  { href: "/jobs", label: "Jobs", hint: "Queue & retry" },
  { href: "/insights", label: "Insights", hint: "Charts & engagement" },
] as const;

export function DashboardHome() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<InsightsCounts | null>(null);
  const [source, setSource] = useState<"api" | "fallback" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    const t = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(t);
  }, [router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadInsightsOverview();
      setCounts(result.overview.counts);
      setSource(result.source);
    } catch (err) {
      setCounts(null);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load dashboard",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [ready, refresh]);

  if (!ready) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="gg-loading text-[var(--muted)]">
          <span className="gg-spinner" aria-hidden />
          Checking session…
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Workspace snapshot — projects, assets, clips, and active jobs.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="text-sm text-[var(--brand)] hover:underline disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {source === "fallback" ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          Counts from local lists (Insights API pending). Clips may show 0 until
          overview lands.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !counts ? (
        <p className="gg-loading text-sm text-[var(--muted)]">
          <span className="gg-spinner" aria-hidden />
          Loading counts…
        </p>
      ) : null}

      {counts ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DashCard label="Projects" value={counts.projects} href="/projects" />
          <DashCard label="Assets" value={counts.assets} href="/assets" />
          <DashCard label="Clips" value={counts.clips} href="/projects" />
          <DashCard
            label="Jobs running"
            value={counts.jobsRunning}
            href="/jobs"
          />
        </div>
      ) : !loading ? (
        <div className="gg-empty rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
          <p className="font-medium">No metrics yet</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Create a project or upload an asset to populate the dashboard.
          </p>
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-semibold">Golden path</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Jump into the demo flow — script → footage → clips → editor → packs.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--brand)]"
            >
              <span className="font-medium text-[var(--brand)]">{link.label}</span>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{link.hint}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--brand)]"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </Link>
  );
}
