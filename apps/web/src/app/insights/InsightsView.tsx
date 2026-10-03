"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasToken } from "@/lib/auth-storage";
import {
  PLATFORM_LABELS,
  STAGE_LABELS,
  type Platform,
  type ProjectStage,
} from "@/components/projects/constants";
import {
  ApiError,
  loadInsightsOverview,
  type InsightsOverview,
} from "@/app/insights/insights-api";
import { EngagementForm } from "@/app/insights/EngagementForm";
import { SimpleBarChart } from "@/app/insights/SimpleBarChart";

function stageLabel(stage: string) {
  return STAGE_LABELS[stage as ProjectStage] ?? stage;
}

function platformLabel(platform: string) {
  return PLATFORM_LABELS[platform as Platform] ?? platform;
}

export function InsightsView() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState<InsightsOverview | null>(null);
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
      setOverview(result.overview);
      setSource(result.source);
    } catch (err) {
      setOverview(null);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load insights",
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

  const counts = overview?.counts;

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Production metrics, stage mix, clips, and platform pack mix.
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
          Showing local list aggregates — Insights API not available yet
          (clips/platform mix fill in after Anto overview).
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !overview ? (
        <p className="gg-loading text-sm text-[var(--muted)]">
          <span className="gg-spinner" aria-hidden />
          Loading insights…
        </p>
      ) : null}

      {counts ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Projects" value={counts.projects} />
          <MetricCard label="Assets" value={counts.assets} />
          <MetricCard label="Clips" value={counts.clips} />
          <MetricCard label="Jobs running" value={counts.jobsRunning} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold">Stage distribution</h2>
          <div className="mt-3">
            <SimpleBarChart
              items={(overview?.stageDistribution ?? []).map((s) => ({
                label: stageLabel(s.stage),
                count: s.count,
              }))}
              emptyLabel="No projects in stages yet"
            />
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold">Clips per project</h2>
          <div className="mt-3">
            <SimpleBarChart
              items={(overview?.clipsPerProject ?? []).map((c) => ({
                label: c.projectTitle || c.projectId.slice(0, 8) || "Project",
                count: c.count,
              }))}
              emptyLabel="No clip counts yet"
            />
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold">Platform pack mix</h2>
          <div className="mt-3">
            <SimpleBarChart
              items={(overview?.platformMix ?? []).map((p) => ({
                label: platformLabel(p.platform),
                count: p.count,
              }))}
              emptyLabel="No platform packs yet"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <EngagementForm onSubmitted={() => void refresh()} />
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            How to read this
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Stage bars = projects currently in each workflow stage.</li>
            <li>Clips per project = rendered / candidate clip totals from overview.</li>
            <li>Platform mix = platform pack counts (YouTube, Shorts, Reels, …).</li>
            <li>Engagement is manual until social APIs exist.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}
