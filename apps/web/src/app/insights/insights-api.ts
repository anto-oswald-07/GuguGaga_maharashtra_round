/**
 * Insights + jobs helpers for Phase 10 (kept under app/ allowed paths).
 * Reuses `apiFetch` from `@/lib/api`. Normalizes Anto `@creatorai/shared` overview shape.
 */

import {
  ApiError,
  apiFetch,
  listAssets,
  listJobs,
  type Job,
} from "@/lib/api";
import { listProjects, type Project } from "@/components/projects/project-api";
import {
  PROJECT_STAGES,
  type Platform,
  type ProjectStage,
} from "@/components/projects/constants";

export { ApiError };

export type InsightsCounts = {
  projects: number;
  assets: number;
  clips: number;
  jobsRunning: number;
};

export type StageCount = {
  stage: ProjectStage | string;
  count: number;
};

export type ClipsPerProject = {
  projectId: string;
  projectTitle?: string;
  count: number;
};

export type PlatformMixItem = {
  platform: Platform | string;
  count: number;
};

export type InsightsOverview = {
  counts: InsightsCounts;
  stageDistribution: StageCount[];
  clipsPerProject: ClipsPerProject[];
  platformMix: PlatformMixItem[];
  /** Optional FR-INT-001 time-in-stage proxy (ms avg) if API provides. */
  avgTimeInStageMs?: number | null;
};

export type EngagementPayload = {
  projectId: string;
  platform?: Platform | string;
  views: number;
  likes: number;
  notes?: string;
};

export type EngagementRecord = EngagementPayload & {
  id?: string;
  createdAt?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeOverview(raw: unknown): InsightsOverview {
  const r = asRecord(raw) ?? {};
  const countsRaw = asRecord(r.counts) ?? r;
  const stageRaw = Array.isArray(r.stageDistribution)
    ? r.stageDistribution
    : Array.isArray(r.stages)
      ? r.stages
      : [];
  const clipsRaw = Array.isArray(r.clipsPerProject)
    ? r.clipsPerProject
    : Array.isArray(r.clipsByProject)
      ? r.clipsByProject
      : [];
  const mixRaw = Array.isArray(r.platformMix)
    ? r.platformMix
    : Array.isArray(r.platformPackMix)
      ? r.platformPackMix
      : [];

  return {
    counts: {
      projects: num(countsRaw.projects ?? countsRaw.projectCount),
      assets: num(countsRaw.assets ?? countsRaw.assetCount),
      clips: num(countsRaw.clips ?? countsRaw.clipCount),
      jobsRunning: num(
        countsRaw.jobsRunning ??
          countsRaw.runningJobs ??
          countsRaw.jobsActive,
      ),
    },
    stageDistribution: stageRaw.map((item) => {
      const row = asRecord(item) ?? {};
      return {
        stage: String(row.stage ?? row.name ?? "UNKNOWN"),
        count: num(row.count ?? row.value),
      };
    }),
    clipsPerProject: clipsRaw.map((item) => {
      const row = asRecord(item) ?? {};
      return {
        projectId: String(row.projectId ?? row.id ?? ""),
        projectTitle:
          typeof row.projectTitle === "string"
            ? row.projectTitle
            : typeof row.title === "string"
              ? row.title
              : undefined,
        // API (`@creatorai/shared`) uses `clipCount`; older drafts used `count`/`clips`.
        count: num(row.clipCount ?? row.count ?? row.clips),
      };
    }),
    platformMix: mixRaw.map((item) => {
      const row = asRecord(item) ?? {};
      return {
        platform: String(row.platform ?? row.name ?? "UNKNOWN"),
        count: num(row.count ?? row.value),
      };
    }),
    // API returns avgTimeInStageMs as [{ stage, avgMs }]; UI only needs a scalar optional.
    avgTimeInStageMs: (() => {
      if (r.avgTimeInStageMs === null || r.avgTimeInStageMs === undefined) {
        return null;
      }
      if (Array.isArray(r.avgTimeInStageMs)) {
        const vals = r.avgTimeInStageMs
          .map((item) => {
            const row = asRecord(item) ?? {};
            return row.avgMs === null || row.avgMs === undefined
              ? null
              : num(row.avgMs, 0);
          })
          .filter((n): n is number => typeof n === "number" && n > 0);
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      }
      return num(r.avgTimeInStageMs, 0);
    })(),
  };
}

/** `GET /insights/overview` — production metrics (SDD §5.9). */
export async function getInsightsOverview(): Promise<InsightsOverview> {
  const raw = await apiFetch<unknown>("/insights/overview");
  return normalizeOverview(raw);
}

/** `POST /insights/engagement` — manual views/likes (FR-INT-003). */
export function postEngagement(payload: EngagementPayload) {
  return apiFetch<EngagementRecord>("/insights/engagement", {
    method: "POST",
    body: payload,
  });
}

/** `POST /jobs/:id/retry` — requeue failed job. */
export function retryJob(jobId: string) {
  return apiFetch<Job>(`/jobs/${jobId}/retry`, { method: "POST" });
}

function countRunningJobs(jobs: Job[]): number {
  return jobs.filter(
    (j) => j.status === "RUNNING" || j.status === "QUEUED",
  ).length;
}

function stageDistributionFromProjects(projects: Project[]): StageCount[] {
  const map = new Map<string, number>();
  for (const stage of PROJECT_STAGES) map.set(stage, 0);
  for (const p of projects) {
    map.set(p.stage, (map.get(p.stage) ?? 0) + 1);
  }
  return [...map.entries()].map(([stage, count]) => ({ stage, count }));
}

/**
 * Client-side fallback when `/insights/overview` is unavailable (pre-Anto).
 * Clips/platform mix stay empty until packs/clips APIs are aggregated server-side.
 */
export async function buildLocalOverviewFallback(): Promise<InsightsOverview> {
  const [projectsRes, assetsRes, jobsRes] = await Promise.all([
    listProjects().catch(() => ({ items: [] as Project[] })),
    listAssets().catch(() => ({ items: [] as Awaited<ReturnType<typeof listAssets>>["items"] })),
    listJobs().catch(() => ({ items: [] as Job[] })),
  ]);

  const projects = projectsRes.items ?? [];
  const assets = (assetsRes.items ?? []).filter((a) => !a.deletedAt);
  const jobs = jobsRes.items ?? [];

  return {
    counts: {
      projects: projects.length,
      assets: assets.length,
      clips: 0,
      jobsRunning: countRunningJobs(jobs),
    },
    stageDistribution: stageDistributionFromProjects(projects),
    clipsPerProject: projects.map((p) => ({
      projectId: p.id,
      projectTitle: p.title,
      count: 0,
    })),
    platformMix: [],
    avgTimeInStageMs: null,
  };
}

/** Prefer API overview; on 404/network fall back to local lists. */
export async function loadInsightsOverview(): Promise<{
  overview: InsightsOverview;
  source: "api" | "fallback";
}> {
  try {
    const overview = await getInsightsOverview();
    return { overview, source: "api" };
  } catch (err) {
    if (err instanceof ApiError && err.status !== 404 && err.status < 500) {
      throw err;
    }
    const overview = await buildLocalOverviewFallback();
    return { overview, source: "fallback" };
  }
}
