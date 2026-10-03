import { clearToken, getToken } from "./auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export type ApiErrorBody = {
  error?: string;
  message?: string;
  statusCode?: number;
};

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, message: string, body: ApiErrorBody | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
};

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (body !== undefined && !isFormData && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getToken();
    if (token) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: requestHeaders,
    body:
      body === undefined
        ? undefined
        : isFormData
          ? (body as FormData)
          : JSON.stringify(body),
  });

  if (response.status === 401) {
    clearToken();
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const errBody = (data ?? {}) as ApiErrorBody;
    throw new ApiError(
      response.status,
      errBody.message || errBody.error || `Request failed (${response.status})`,
      errBody,
    );
  }

  return data as T;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  workspaceId?: string;
  createdAt?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
  workspace?: {
    id: string;
    userId: string;
    createdAt: string;
  };
};

export type RegisterPayload = {
  email: string;
  password: string;
  name: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export function register(payload: RegisterPayload) {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

export function login(payload: LoginPayload) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

/** Asset types per SDD enum AssetType. */
export type AssetType = "VIDEO" | "IMAGE" | "AUDIO" | "DOCUMENT" | "OTHER";

export type Asset = {
  id: string;
  workspaceId: string;
  type: AssetType;
  name: string;
  path: string;
  mime: string;
  size: number;
  tags: string[];
  description: string | null;
  deletedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string;
};

/** Matches `@creatorai/shared` `assetListResponseSchema` (`items`, not `assets`). */
export type AssetListResponse = {
  items: Asset[];
};

export type ListAssetsParams = {
  type?: AssetType | "";
  q?: string;
  tag?: string;
};

export type UpdateAssetPayload = {
  name?: string;
  tags?: string[];
  description?: string | null;
};

function buildQuery(params: ListAssetsParams = {}): string {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.tag?.trim()) query.set("tag", params.tag.trim());
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function listAssets(params: ListAssetsParams = {}) {
  return apiFetch<AssetListResponse>(`/assets${buildQuery(params)}`);
}

export function getAsset(id: string) {
  return apiFetch<Asset>(`/assets/${id}`);
}

export function uploadAsset(file: File, extras?: { name?: string; tags?: string }) {
  const form = new FormData();
  form.append("file", file);
  if (extras?.name?.trim()) form.append("name", extras.name.trim());
  if (extras?.tags?.trim()) form.append("tags", extras.tags.trim());

  return apiFetch<Asset>("/assets", {
    method: "POST",
    body: form,
  });
}

export function updateAsset(id: string, payload: UpdateAssetPayload) {
  return apiFetch<Asset>(`/assets/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteAsset(id: string) {
  return apiFetch<{ ok: true } | Asset>(`/assets/${id}`, {
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------- */
/* Scripts + Jobs (Phase 5) — shapes aligned to SDD §5.4 / §5.9 / §6.1        */
/* TODO_SHARED: replace with `@creatorai/shared` once Anto/Cyrus land Zod     */
/* -------------------------------------------------------------------------- */

export type ScriptPlatform =
  | "YOUTUBE"
  | "YOUTUBE_SHORTS"
  | "INSTAGRAM_REELS"
  | "TIKTOK"
  | "LINKEDIN";

export type ScriptContent = {
  hook: string;
  body: string;
  cta: string;
  title?: string;
  rawText?: string;
};

export type ScriptVersion = {
  id: string;
  scriptId: string;
  version: number;
  content: ScriptContent;
  /** Free-form note: AI | USER | REFINE | etc. */
  source?: string | null;
  createdAt: string;
};

export type SupportingContent = {
  titles: string[];
  captions: string[];
  hashtags: string[];
  description?: string | null;
};

export type ScriptDocument = {
  id: string;
  projectId: string;
  workspaceId?: string;
  /** Display label — API uses `title`; UI historically used `topic`. */
  topic: string | null;
  title?: string | null;
  audience: string | null;
  tone: string | null;
  platform: ScriptPlatform | null;
  /** Latest structured content (convenience; may mirror latest version). */
  content: ScriptContent | null;
  hooks: string[];
  supporting: SupportingContent | null;
  versions: ScriptVersion[];
  createdAt: string;
  updatedAt: string;
};

export type ScriptListResponse = {
  items: ScriptDocument[];
};

export type GenerateScriptPayload = {
  topic: string;
  audience: string;
  tone: string;
  platform: ScriptPlatform;
};

export type RefineScriptPayload = {
  instruction: string;
};

export type SaveScriptVersionPayload = {
  content: ScriptContent;
  source?: string;
};

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type Job = {
  id: string;
  workspaceId?: string;
  projectId?: string | null;
  type: string;
  status: JobStatus;
  progress: number;
  input?: unknown;
  output?: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Enqueue responses — Anto may return scriptId immediately or only after job. */
export type EnqueueJobResponse = {
  jobId: string;
  scriptId?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeVersion(raw: unknown): ScriptVersion {
  const r = asRecord(raw) ?? {};
  const contentRaw = asRecord(r.content) ?? {};
  return {
    id: String(r.id ?? ""),
    scriptId: String(r.scriptId ?? r.scriptDocumentId ?? ""),
    version: typeof r.version === "number" ? r.version : 0,
    content: {
      hook: typeof contentRaw.hook === "string" ? contentRaw.hook : "",
      body: typeof contentRaw.body === "string" ? contentRaw.body : "",
      cta: typeof contentRaw.cta === "string" ? contentRaw.cta : "",
      ...(typeof contentRaw.title === "string"
        ? { title: contentRaw.title }
        : {}),
      ...(typeof contentRaw.rawText === "string"
        ? { rawText: contentRaw.rawText }
        : {}),
    },
    source: typeof r.source === "string" ? r.source : null,
    createdAt: String(r.createdAt ?? ""),
  };
}

/** Map API ScriptDocumentDto (+ detail) → UI ScriptDocument. */
function normalizeScript(raw: unknown): ScriptDocument {
  const r = asRecord(raw) ?? {};
  const latest = r.latestVersion ? normalizeVersion(r.latestVersion) : null;
  const versionsRaw = Array.isArray(r.versions) ? r.versions : null;
  const versions =
    versionsRaw && versionsRaw.length > 0
      ? versionsRaw.map(normalizeVersion)
      : latest
        ? [latest]
        : [];
  const contentFromField = asRecord(r.content);
  const content: ScriptContent | null = contentFromField
    ? {
        hook: typeof contentFromField.hook === "string" ? contentFromField.hook : "",
        body: typeof contentFromField.body === "string" ? contentFromField.body : "",
        cta: typeof contentFromField.cta === "string" ? contentFromField.cta : "",
      }
    : latest?.content ?? versions[0]?.content ?? null;
  const title =
    typeof r.title === "string"
      ? r.title
      : typeof r.topic === "string"
        ? r.topic
        : null;

  return {
    id: String(r.id ?? ""),
    projectId: String(r.projectId ?? ""),
    workspaceId: typeof r.workspaceId === "string" ? r.workspaceId : undefined,
    topic: title,
    title,
    audience: typeof r.audience === "string" ? r.audience : null,
    tone: typeof r.tone === "string" ? r.tone : null,
    platform:
      typeof r.platform === "string" ? (r.platform as ScriptPlatform) : null,
    content,
    hooks: Array.isArray(r.hooks)
      ? r.hooks.filter((h): h is string => typeof h === "string")
      : [],
    supporting: (r.supporting as SupportingContent | null) ?? null,
    versions,
    createdAt: String(r.createdAt ?? ""),
    updatedAt: String(r.updatedAt ?? ""),
  };
}

export async function listProjectScripts(projectId: string) {
  const raw = await apiFetch<{ items: unknown[] }>(
    `/projects/${projectId}/scripts`,
  );
  return {
    items: (raw.items ?? []).map(normalizeScript),
  } satisfies ScriptListResponse;
}

export function createProjectScript(
  projectId: string,
  payload: Partial<GenerateScriptPayload> & { content?: ScriptContent },
) {
  return apiFetch<unknown>(`/projects/${projectId}/scripts`, {
    method: "POST",
    body: payload,
  }).then(normalizeScript);
}

export function generateProjectScript(
  projectId: string,
  payload: GenerateScriptPayload,
) {
  return apiFetch<EnqueueJobResponse>(
    `/projects/${projectId}/scripts/generate`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function getScript(scriptId: string) {
  const raw = await apiFetch<unknown>(`/scripts/${scriptId}`);
  return normalizeScript(raw);
}

export function refineScript(scriptId: string, payload: RefineScriptPayload) {
  return apiFetch<EnqueueJobResponse>(`/scripts/${scriptId}/refine`, {
    method: "POST",
    body: payload,
  });
}

export function generateScriptHooks(scriptId: string, n = 5) {
  return apiFetch<EnqueueJobResponse>(`/scripts/${scriptId}/hooks`, {
    method: "POST",
    body: { count: n },
  });
}

export function generateScriptSupporting(
  scriptId: string,
  platforms?: ScriptPlatform[],
) {
  const list =
    platforms && platforms.length > 0 ? platforms : (["YOUTUBE_SHORTS"] as ScriptPlatform[]);
  return apiFetch<EnqueueJobResponse>(`/scripts/${scriptId}/supporting`, {
    method: "POST",
    body: { platforms: list },
  });
}

export async function saveScriptVersion(
  scriptId: string,
  payload: SaveScriptVersionPayload,
) {
  const source =
    payload.source === "MANUAL" || !payload.source ? "USER" : payload.source;
  const raw = await apiFetch<unknown>(`/scripts/${scriptId}/versions`, {
    method: "POST",
    body: {
      content: payload.content,
      source,
    },
  });
  // API returns ScriptVersionDto; UI also accepts full document
  const rec = asRecord(raw);
  if (rec && Array.isArray(rec.versions)) {
    return normalizeScript(raw);
  }
  return normalizeVersion(raw);
}

export function getJob(jobId: string) {
  return apiFetch<Job>(`/jobs/${jobId}`);
}

export function listJobs() {
  return apiFetch<{ items: Job[] }>("/jobs");
}

/* -------------------------------------------------------------------------- */
/* Mapping + Transcription (Phase 6) — SDD §5.5                               */
/* TODO_SHARED: replace with `@creatorai/shared` once Anto lands Zod DTOs     */
/* -------------------------------------------------------------------------- */

export type TranscriptSegmentDto = {
  id?: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type TranscriptDto = {
  id: string;
  projectId: string;
  assetId: string;
  segments: TranscriptSegmentDto[];
  createdAt: string;
  updatedAt?: string;
};

export type TranscriptListResponse = {
  items: TranscriptDto[];
};

export type ScriptFootageMapDto = {
  id: string;
  projectId: string;
  scriptId?: string | null;
  transcriptId?: string | null;
  /** Script section label or excerpt (SDD scriptRef). */
  scriptRef: string;
  startMs: number;
  endMs: number;
  /** 0–1 confidence; UI highlights low values. */
  confidence: number;
  createdAt?: string;
  updatedAt?: string;
};

export type MappingListResponse = {
  items: ScriptFootageMapDto[];
};

export type TranscribeRequest = {
  assetId: string;
};

export type AlignRequest = {
  scriptId: string;
  transcriptId?: string;
  assetId?: string;
};

export type UpdateMappingPayload = {
  scriptRef?: string;
  startMs?: number;
  endMs?: number;
  confidence?: number;
};

/** Match `@creatorai/shared` / API MappingListResponse (FR-STV-006). */
const LOW_CONFIDENCE_THRESHOLD = 0.55;

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

export { LOW_CONFIDENCE_THRESHOLD };

function normalizeSegment(raw: unknown): TranscriptSegmentDto {
  const r = asRecord(raw) ?? {};
  return {
    ...(typeof r.id === "string" ? { id: r.id } : {}),
    startMs: typeof r.startMs === "number" ? r.startMs : Number(r.startMs) || 0,
    endMs: typeof r.endMs === "number" ? r.endMs : Number(r.endMs) || 0,
    text: typeof r.text === "string" ? r.text : String(r.text ?? ""),
  };
}

function normalizeTranscript(raw: unknown): TranscriptDto {
  const r = asRecord(raw) ?? {};
  const segmentsRaw = Array.isArray(r.segments) ? r.segments : [];
  return {
    id: String(r.id ?? ""),
    projectId: String(r.projectId ?? ""),
    assetId: String(r.assetId ?? ""),
    segments: segmentsRaw.map(normalizeSegment),
    createdAt: String(r.createdAt ?? ""),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}

function normalizeMapping(raw: unknown): ScriptFootageMapDto {
  const r = asRecord(raw) ?? {};
  const confidenceRaw = r.confidence;
  const confidence =
    typeof confidenceRaw === "number"
      ? confidenceRaw
      : Number(confidenceRaw) || 0;
  const normalized =
    confidence > 1 ? confidence / 100 : confidence;
  const scriptId =
    typeof r.scriptId === "string"
      ? r.scriptId
      : typeof r.scriptDocumentId === "string"
        ? r.scriptDocumentId
        : null;
  return {
    id: String(r.id ?? ""),
    projectId: String(r.projectId ?? ""),
    scriptId,
    transcriptId: typeof r.transcriptId === "string" ? r.transcriptId : null,
    scriptRef:
      typeof r.scriptRef === "string"
        ? r.scriptRef
        : typeof r.scriptExcerpt === "string"
          ? r.scriptExcerpt
          : "",
    startMs: typeof r.startMs === "number" ? r.startMs : Number(r.startMs) || 0,
    endMs: typeof r.endMs === "number" ? r.endMs : Number(r.endMs) || 0,
    confidence: normalized,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}

export function transcribeProjectAsset(
  projectId: string,
  payload: TranscribeRequest,
) {
  return apiFetch<EnqueueJobResponse>(`/projects/${projectId}/transcribe`, {
    method: "POST",
    body: payload,
  });
}

export async function listProjectTranscripts(projectId: string) {
  const raw = await apiFetch<{ items?: unknown[] } | unknown[]>(
    `/projects/${projectId}/transcripts`,
  );
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.items)
      ? raw.items
      : [];
  return { items: items.map(normalizeTranscript) } satisfies TranscriptListResponse;
}

export function alignProjectScript(projectId: string, payload: AlignRequest) {
  return apiFetch<EnqueueJobResponse>(`/projects/${projectId}/align`, {
    method: "POST",
    body: payload,
  });
}

export async function listProjectMappings(projectId: string) {
  const raw = await apiFetch<{ items?: unknown[] } | unknown[]>(
    `/projects/${projectId}/mappings`,
  );
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.items)
      ? raw.items
      : [];
  return { items: items.map(normalizeMapping) } satisfies MappingListResponse;
}

export async function updateMapping(
  mappingId: string,
  payload: UpdateMappingPayload,
) {
  const raw = await apiFetch<unknown>(`/mappings/${mappingId}`, {
    method: "PATCH",
    body: payload,
  });
  return normalizeMapping(raw);
}

/** Format milliseconds as m:ss.mmm for transcript/mapping UI. */
export function formatTimecode(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Clips (Phase 7) — SDD §5.6                                                 */
/* TODO_SHARED: replace with `@creatorai/shared` once Anto lands Zod DTOs     */
/* -------------------------------------------------------------------------- */

export type ClipCandidateStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "rendered";

export type ClipCandidateDto = {
  id: string;
  projectId: string;
  /** Source footage asset (`sourceAssetId` from API). */
  assetId?: string | null;
  title: string;
  startMs: number;
  endMs: number;
  /** 0–1 score / confidence. */
  score: number;
  status: ClipCandidateStatus;
  /** Asset created by RENDER_CLIP job. */
  renderedAssetId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ClipCandidateListResponse = {
  items: ClipCandidateDto[];
};

/** Body for `POST /projects/:id/clips/propose` (matches shared proposeClipsRequestSchema). */
export type ProposeClipsRequest = {
  scriptId?: string;
  transcriptId?: string;
  /** Long-form footage to cut from (API field name). */
  sourceAssetId?: string;
};

export type UpdateClipCandidatePayload = {
  title?: string;
  startMs?: number;
  endMs?: number;
  status?: ClipCandidateStatus;
};

const CLIP_STATUSES: ClipCandidateStatus[] = [
  "proposed",
  "accepted",
  "rejected",
  "rendered",
];

function normalizeClipStatus(raw: unknown): ClipCandidateStatus {
  if (typeof raw === "string") {
    const lower = raw.toLowerCase() as ClipCandidateStatus;
    if (CLIP_STATUSES.includes(lower)) return lower;
    const upper = raw.toUpperCase();
    if (upper === "PROPOSED") return "proposed";
    if (upper === "ACCEPTED") return "accepted";
    if (upper === "REJECTED") return "rejected";
    if (upper === "RENDERED") return "rendered";
  }
  return "proposed";
}

function normalizeClipCandidate(raw: unknown): ClipCandidateDto {
  const r = asRecord(raw) ?? {};
  const scoreRaw = r.score ?? r.confidence;
  const score =
    typeof scoreRaw === "number" ? scoreRaw : Number(scoreRaw) || 0;
  const sourceAssetId =
    typeof r.sourceAssetId === "string"
      ? r.sourceAssetId
      : typeof r.assetId === "string"
        ? r.assetId
        : null;
  return {
    id: String(r.id ?? ""),
    projectId: String(r.projectId ?? ""),
    assetId: sourceAssetId,
    title:
      typeof r.title === "string"
        ? r.title
        : typeof r.titleSuggestion === "string"
          ? r.titleSuggestion
          : "",
    startMs: typeof r.startMs === "number" ? r.startMs : Number(r.startMs) || 0,
    endMs: typeof r.endMs === "number" ? r.endMs : Number(r.endMs) || 0,
    score: score > 1 ? score / 100 : score,
    status: normalizeClipStatus(r.status),
    renderedAssetId:
      typeof r.renderedAssetId === "string"
        ? r.renderedAssetId
        : typeof r.outputAssetId === "string"
          ? r.outputAssetId
          : null,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}

export function proposeProjectClips(
  projectId: string,
  payload: ProposeClipsRequest = {},
) {
  return apiFetch<EnqueueJobResponse>(`/projects/${projectId}/clips/propose`, {
    method: "POST",
    body: payload,
  });
}

export async function listClipCandidates(projectId: string) {
  const raw = await apiFetch<{ items?: unknown[] } | unknown[]>(
    `/projects/${projectId}/clips/candidates`,
  );
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.items)
      ? raw.items
      : [];
  return {
    items: items.map(normalizeClipCandidate),
  } satisfies ClipCandidateListResponse;
}

export async function updateClipCandidate(
  candidateId: string,
  payload: UpdateClipCandidatePayload,
) {
  const raw = await apiFetch<unknown>(`/clips/candidates/${candidateId}`, {
    method: "PATCH",
    body: payload,
  });
  return normalizeClipCandidate(raw);
}

export function renderClipCandidate(candidateId: string) {
  return apiFetch<EnqueueJobResponse>(
    `/clips/candidates/${candidateId}/render`,
    { method: "POST" },
  );
}
