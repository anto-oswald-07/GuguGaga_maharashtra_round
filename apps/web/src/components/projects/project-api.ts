/**
 * Project API helpers for Phase 4 UI.
 * Uses shared `apiFetch` from `@/lib/api` (Phase 4 plan omitted api.ts —
 * keep project methods here under allowed `components/projects/**`).
 */
import { ApiError, apiFetch, listAssets, type Asset } from "@/lib/api";
import type { Platform, ProjectStage } from "./constants";

export { ApiError, listAssets };
export type { Asset };

export type Project = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  stage: ProjectStage;
  targetPlatforms: Platform[];
  assetIds: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectListResponse = {
  items: Project[];
};

export type CreateProjectPayload = {
  title: string;
  description?: string | null;
  targetPlatforms?: Platform[];
};

export type ListProjectsParams = {
  stage?: ProjectStage | "";
  q?: string;
};

export type StageEvent = {
  id: string;
  projectId: string;
  fromStage: ProjectStage | null;
  toStage: ProjectStage;
  createdAt: string;
};

export type StageHistoryResponse = {
  items: StageEvent[];
};

function buildQuery(params: ListProjectsParams = {}): string {
  const query = new URLSearchParams();
  if (params.stage) query.set("stage", params.stage);
  if (params.q?.trim()) query.set("q", params.q.trim());
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function listProjects(params: ListProjectsParams = {}) {
  return apiFetch<ProjectListResponse>(`/projects${buildQuery(params)}`);
}

export function getProject(id: string) {
  return apiFetch<Project>(`/projects/${id}`);
}

export function createProject(payload: CreateProjectPayload) {
  return apiFetch<Project>("/projects", {
    method: "POST",
    body: payload,
  });
}

export function transitionProjectStage(id: string, stage: ProjectStage) {
  return apiFetch<Project>(`/projects/${id}/stage`, {
    method: "POST",
    body: { stage },
  });
}

export function attachProjectAssets(id: string, assetIds: string[]) {
  return apiFetch<Project>(`/projects/${id}/assets`, {
    method: "POST",
    body: { assetIds },
  });
}

export function detachProjectAssets(id: string, assetIds: string[]) {
  return apiFetch<Project>(`/projects/${id}/assets`, {
    method: "DELETE",
    body: { assetIds },
  });
}

export function getProjectStageHistory(id: string) {
  return apiFetch<StageHistoryResponse>(`/projects/${id}/stage-history`);
}

export function deleteProject(id: string) {
  return apiFetch<{ id: string; deletedAt: string }>(`/projects/${id}`, {
    method: "DELETE",
  });
}
