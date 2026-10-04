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
  scenes?: ScriptScene[];
};

export type ScriptBeatType =
  | "HOOK"
  | "POINT"
  | "BROLL"
  | "CTA"
  | "TRANSITION";

export type SceneFulfillmentMode =
  | "EMPTY"
  | "UPLOAD"
  | "AI_GENERATED"
  | "TRIMMED";

export type SceneFulfillment = {
  mode: SceneFulfillmentMode;
  assetId?: string;
  clipCandidateId?: string;
  transcriptId?: string;
  opinion?: string;
  matchConfidence?: number;
};

export type ScriptScene = {
  id: string;
  ordinal: number;
  title: string;
  spokenText: string;
  beatType: ScriptBeatType;
  targetDurationMs: number;
  visualBrief: string;
  fulfillment: SceneFulfillment;
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

function normalizeScene(raw: unknown, index: number): ScriptScene | null {
  const r = asRecord(raw);
  if (!r) return null;
  const fulfillmentRaw = asRecord(r.fulfillment) ?? {};
  const modeRaw = typeof fulfillmentRaw.mode === "string" ? fulfillmentRaw.mode : "EMPTY";
  const mode: SceneFulfillmentMode =
    modeRaw === "UPLOAD" ||
    modeRaw === "AI_GENERATED" ||
    modeRaw === "TRIMMED" ||
    modeRaw === "EMPTY"
      ? modeRaw
      : "EMPTY";
  const beatRaw = typeof r.beatType === "string" ? r.beatType : "POINT";
  const beatType: ScriptBeatType =
    beatRaw === "HOOK" ||
    beatRaw === "POINT" ||
    beatRaw === "BROLL" ||
    beatRaw === "CTA" ||
    beatRaw === "TRANSITION"
      ? beatRaw
      : "POINT";
  return {
    id: typeof r.id === "string" ? r.id : `scene-${index}`,
    ordinal: typeof r.ordinal === "number" ? r.ordinal : index,
    title: typeof r.title === "string" ? r.title : `Scene ${index + 1}`,
    spokenText: typeof r.spokenText === "string" ? r.spokenText : "",
    beatType,
    targetDurationMs:
      typeof r.targetDurationMs === "number" && r.targetDurationMs > 0
        ? r.targetDurationMs
        : 8_000,
    visualBrief: typeof r.visualBrief === "string" ? r.visualBrief : "",
    fulfillment: {
      mode,
      ...(typeof fulfillmentRaw.assetId === "string"
        ? { assetId: fulfillmentRaw.assetId }
        : {}),
      ...(typeof fulfillmentRaw.clipCandidateId === "string"
        ? { clipCandidateId: fulfillmentRaw.clipCandidateId }
        : {}),
      ...(typeof fulfillmentRaw.transcriptId === "string"
        ? { transcriptId: fulfillmentRaw.transcriptId }
        : {}),
      ...(typeof fulfillmentRaw.opinion === "string"
        ? { opinion: fulfillmentRaw.opinion }
        : {}),
      ...(typeof fulfillmentRaw.matchConfidence === "number"
        ? { matchConfidence: fulfillmentRaw.matchConfidence }
        : {}),
    },
  };
}

function normalizeScriptContent(raw: unknown): ScriptContent {
  const contentRaw = asRecord(raw) ?? {};
  const scenesRaw = Array.isArray(contentRaw.scenes) ? contentRaw.scenes : [];
  const scenes = scenesRaw
    .map((s, i) => normalizeScene(s, i))
    .filter((s): s is ScriptScene => s != null);
  return {
    hook: typeof contentRaw.hook === "string" ? contentRaw.hook : "",
    body: typeof contentRaw.body === "string" ? contentRaw.body : "",
    cta: typeof contentRaw.cta === "string" ? contentRaw.cta : "",
    ...(typeof contentRaw.title === "string" ? { title: contentRaw.title } : {}),
    ...(typeof contentRaw.rawText === "string"
      ? { rawText: contentRaw.rawText }
      : {}),
    ...(scenes.length > 0 ? { scenes } : {}),
  };
}

function normalizeVersion(raw: unknown): ScriptVersion {
  const r = asRecord(raw) ?? {};
  return {
    id: String(r.id ?? ""),
    scriptId: String(r.scriptId ?? r.scriptDocumentId ?? ""),
    version: typeof r.version === "number" ? r.version : 0,
    content: normalizeScriptContent(r.content),
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
    ? normalizeScriptContent(contentFromField)
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

export function deleteScript(scriptId: string) {
  return apiFetch<{ id: string; deleted: true }>(`/scripts/${scriptId}`, {
    method: "DELETE",
  });
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

/* -------------------------------------------------------------------------- */
/* Scene pipeline (Phases A–C) — fulfill / generate / review / match          */
/* -------------------------------------------------------------------------- */

export type FulfillScenePayload = {
  scriptId: string;
  sceneId: string;
  assetId: string;
};

export type GenerateScenePayload = {
  scriptId: string;
  sceneId: string;
  prompt?: string;
};

export type ScenePipelinePayload = {
  scriptId: string;
  sceneId?: string;
};

export type FulfillSceneResponse = {
  scriptId: string;
  versionId: string;
  scene: ScriptScene;
};

export function fulfillScene(projectId: string, payload: FulfillScenePayload) {
  return apiFetch<FulfillSceneResponse>(`/projects/${projectId}/scenes/fulfill`, {
    method: "POST",
    body: payload,
  });
}

export function generateScene(projectId: string, payload: GenerateScenePayload) {
  return apiFetch<EnqueueJobResponse>(`/projects/${projectId}/scenes/generate`, {
    method: "POST",
    body: payload,
  });
}

export function reviewFootage(projectId: string, payload: ScenePipelinePayload) {
  return apiFetch<EnqueueJobResponse>(`/projects/${projectId}/scenes/review`, {
    method: "POST",
    body: payload,
  });
}

export function matchScenes(projectId: string, payload: ScenePipelinePayload) {
  return apiFetch<EnqueueJobResponse>(`/projects/${projectId}/scenes/match`, {
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

export function deleteClipCandidate(candidateId: string) {
  return apiFetch<{ id: string; deleted: true }>(
    `/clips/candidates/${candidateId}`,
    { method: "DELETE" },
  );
}

/* -------------------------------------------------------------------------- */
/* Timelines (Phase 8) — SDD §4.3 / §5.7                                      */
/* TODO_SHARED: replace with `@creatorai/timeline-schema` once Cyrus lands it */
/* -------------------------------------------------------------------------- */

export type TimelineTextStyle = {
  position?: string;
  fontSize?: number;
};

export type TimelineVideoClip = {
  id: string;
  assetId: string;
  srcStartMs: number;
  srcEndMs: number;
  timelineStartMs: number;
  label?: string;
  /** Images hold as stills for (srcEndMs - srcStartMs). */
  mediaKind?: "video" | "image";
};

export type TimelineAudioClip = {
  id: string;
  assetId: string;
  srcStartMs: number;
  srcEndMs: number;
  timelineStartMs: number;
  label?: string;
};

export type TimelineTextItem = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  style?: TimelineTextStyle;
};

export type TimelineCaptionItem = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
};

export type TimelineVideoTrack = {
  id: string;
  type: "video";
  clips: TimelineVideoClip[];
};

export type TimelineAudioTrack = {
  id: string;
  type: "audio";
  clips: TimelineAudioClip[];
};

export type TimelineTextTrack = {
  id: string;
  type: "text";
  items: TimelineTextItem[];
};

export type TimelineCaptionsTrack = {
  id: string;
  type: "captions";
  items: TimelineCaptionItem[];
};

export type TimelineTrack =
  | TimelineVideoTrack
  | TimelineAudioTrack
  | TimelineTextTrack
  | TimelineCaptionsTrack;

export type TimelineJson = {
  schemaVersion: string;
  fps: number;
  durationMs: number;
  tracks: TimelineTrack[];
  transitions: unknown[];
  meta?: Record<string, unknown>;
};

export type TimelineVersionDto = {
  id: string;
  timelineId: string;
  version: number;
  source?: string | null;
  content: TimelineJson;
  createdAt?: string;
};

export type TimelineDocument = {
  id: string;
  projectId: string;
  /** Current working JSON (may also live on latest non-proposal version). */
  content: TimelineJson | null;
  /** Latest AI proposal JSON (not applied until PUT). */
  pendingProposal?: TimelineJson | null;
  pendingProposalVersionId?: string | null;
  versions: TimelineVersionDto[];
  createdAt?: string;
  updatedAt?: string;
};

export type TimelineListResponse = {
  items: TimelineDocument[];
};

export function emptyTimelineJson(
  meta?: Record<string, unknown>,
): TimelineJson {
  return {
    schemaVersion: "1.0",
    fps: 30,
    durationMs: 0,
    tracks: [
      { id: "v1", type: "video", clips: [] },
      { id: "a1", type: "audio", clips: [] },
      { id: "t1", type: "text", items: [] },
      { id: "cap1", type: "captions", items: [] },
    ],
    transitions: [],
    meta: meta ?? { generatedBy: "user" },
  };
}

function normalizeTextStyle(raw: unknown): TimelineTextStyle | undefined {
  const r = asRecord(raw);
  if (!r) return undefined;
  return {
    ...(typeof r.position === "string" ? { position: r.position } : {}),
    ...(typeof r.fontSize === "number" ? { fontSize: r.fontSize } : {}),
  };
}

function normalizeVideoClip(raw: unknown): TimelineVideoClip {
  const r = asRecord(raw) ?? {};
  const mediaKind =
    r.mediaKind === "image" || r.mediaKind === "video"
      ? r.mediaKind
      : undefined;
  return {
    id: String(r.id ?? cryptoRandomId()),
    assetId: String(r.assetId ?? ""),
    srcStartMs:
      typeof r.srcStartMs === "number" ? r.srcStartMs : Number(r.srcStartMs) || 0,
    srcEndMs:
      typeof r.srcEndMs === "number" ? r.srcEndMs : Number(r.srcEndMs) || 0,
    timelineStartMs:
      typeof r.timelineStartMs === "number"
        ? r.timelineStartMs
        : Number(r.timelineStartMs) || 0,
    ...(typeof r.label === "string" ? { label: r.label } : {}),
    ...(mediaKind ? { mediaKind } : {}),
  };
}

function normalizeAudioClip(raw: unknown): TimelineAudioClip {
  const r = asRecord(raw) ?? {};
  return {
    id: String(r.id ?? cryptoRandomId()),
    assetId: String(r.assetId ?? ""),
    srcStartMs:
      typeof r.srcStartMs === "number" ? r.srcStartMs : Number(r.srcStartMs) || 0,
    srcEndMs:
      typeof r.srcEndMs === "number" ? r.srcEndMs : Number(r.srcEndMs) || 0,
    timelineStartMs:
      typeof r.timelineStartMs === "number"
        ? r.timelineStartMs
        : Number(r.timelineStartMs) || 0,
    ...(typeof r.label === "string" ? { label: r.label } : {}),
  };
}

function normalizeTextItem(raw: unknown): TimelineTextItem {
  const r = asRecord(raw) ?? {};
  return {
    id: String(r.id ?? cryptoRandomId()),
    text: typeof r.text === "string" ? r.text : String(r.text ?? ""),
    startMs: typeof r.startMs === "number" ? r.startMs : Number(r.startMs) || 0,
    endMs: typeof r.endMs === "number" ? r.endMs : Number(r.endMs) || 0,
    style: normalizeTextStyle(r.style),
  };
}

function normalizeCaptionItem(raw: unknown): TimelineCaptionItem {
  const r = asRecord(raw) ?? {};
  return {
    id: String(r.id ?? cryptoRandomId()),
    text: typeof r.text === "string" ? r.text : String(r.text ?? ""),
    startMs: typeof r.startMs === "number" ? r.startMs : Number(r.startMs) || 0,
    endMs: typeof r.endMs === "number" ? r.endMs : Number(r.endMs) || 0,
  };
}

function normalizeTrack(raw: unknown): TimelineTrack {
  const r = asRecord(raw) ?? {};
  const type = String(r.type ?? "video");
  const id = String(r.id ?? cryptoRandomId());
  if (type === "text") {
    const items = Array.isArray(r.items) ? r.items.map(normalizeTextItem) : [];
    return { id, type: "text", items };
  }
  if (type === "captions") {
    const items = Array.isArray(r.items)
      ? r.items.map(normalizeCaptionItem)
      : [];
    return { id, type: "captions", items };
  }
  if (type === "audio") {
    const clips = Array.isArray(r.clips) ? r.clips.map(normalizeAudioClip) : [];
    return { id, type: "audio", clips };
  }
  const clips = Array.isArray(r.clips) ? r.clips.map(normalizeVideoClip) : [];
  return { id, type: "video", clips };
}

export function normalizeTimelineJson(raw: unknown): TimelineJson {
  const r = asRecord(raw) ?? {};
  const tracksRaw = Array.isArray(r.tracks) ? r.tracks : [];
  const meta = asRecord(r.meta) ?? undefined;
  return {
    schemaVersion:
      typeof r.schemaVersion === "string" ? r.schemaVersion : "1.0",
    fps: typeof r.fps === "number" ? r.fps : Number(r.fps) || 30,
    durationMs:
      typeof r.durationMs === "number"
        ? r.durationMs
        : Number(r.durationMs) || 0,
    tracks: tracksRaw.map(normalizeTrack),
    transitions: Array.isArray(r.transitions) ? r.transitions : [],
    ...(meta ? { meta } : {}),
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTimelineVersion(raw: unknown): TimelineVersionDto {
  const r = asRecord(raw) ?? {};
  const contentRaw = r.content ?? r.timeline ?? r.json;
  return {
    id: String(r.id ?? ""),
    timelineId: String(r.timelineId ?? r.editTimelineId ?? ""),
    version: typeof r.version === "number" ? r.version : Number(r.version) || 0,
    source: typeof r.source === "string" ? r.source : null,
    content: normalizeTimelineJson(contentRaw ?? emptyTimelineJson()),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
  };
}

function normalizeTimelineDocument(raw: unknown): TimelineDocument {
  const r = asRecord(raw) ?? {};
  const versionsRaw = Array.isArray(r.versions) ? r.versions : [];
  const versions = versionsRaw.map(normalizeTimelineVersion);
  const contentRaw =
    r.content ?? r.current ?? r.timeline ?? r.json ?? null;
  let content: TimelineJson | null = null;
  if (contentRaw && typeof contentRaw === "object") {
    content = normalizeTimelineJson(contentRaw);
  } else if (versions.length > 0) {
    const userVersions = versions.filter(
      (v) =>
        !v.source ||
        !/ai_proposal|proposal/i.test(v.source),
    );
    const pick = userVersions.length > 0 ? userVersions : versions;
    const latest = [...pick].sort((a, b) => b.version - a.version)[0];
    content = latest?.content ?? null;
  }
  const pendingRaw = r.pendingProposal;
  const pendingProposal =
    pendingRaw && typeof pendingRaw === "object"
      ? normalizeTimelineJson(pendingRaw)
      : null;
  return {
    id: String(r.id ?? ""),
    projectId: String(r.projectId ?? ""),
    content,
    pendingProposal,
    pendingProposalVersionId:
      typeof r.pendingProposalVersionId === "string"
        ? r.pendingProposalVersionId
        : null,
    versions,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}

/** Best-effort extract timeline JSON from GENERATE_TIMELINE job.output. */
export function timelineFromJobOutput(output: unknown): TimelineJson | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  if (o.schemaVersion || o.tracks) return normalizeTimelineJson(o);
  if (o.timeline) return normalizeTimelineJson(o.timeline);
  if (o.content) return normalizeTimelineJson(o.content);
  if (o.proposal) return normalizeTimelineJson(o.proposal);
  if (o.result && typeof o.result === "object") {
    return timelineFromJobOutput(o.result);
  }
  return null;
}

export function timelineIdFromJob(
  job: Job,
  fallback?: string | null,
): string | null {
  if (fallback) return fallback;
  const output = asRecord(job.output);
  if (typeof output?.timelineId === "string") return output.timelineId;
  const input = asRecord(job.input);
  if (typeof input?.timelineId === "string") return input.timelineId;
  return null;
}

export function proposeGenerateTimeline(projectId: string) {
  return apiFetch<EnqueueJobResponse & { timelineId?: string }>(
    `/projects/${projectId}/timelines/generate`,
    { method: "POST", body: {} },
  );
}

export async function listProjectTimelines(projectId: string) {
  const raw = await apiFetch<{ items?: unknown[] } | unknown[]>(
    `/projects/${projectId}/timelines`,
  );
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.items)
      ? raw.items
      : [];
  return {
    items: items.map(normalizeTimelineDocument),
  } satisfies TimelineListResponse;
}

export async function getTimeline(timelineId: string) {
  const raw = await apiFetch<unknown>(`/timelines/${timelineId}`);
  return normalizeTimelineDocument(raw);
}

export async function saveTimeline(
  timelineId: string,
  content: TimelineJson,
) {
  const raw = await apiFetch<unknown>(`/timelines/${timelineId}`, {
    method: "PUT",
    body: { timeline: content },
  });
  // API may return document, version, or { timeline, version }
  const r = asRecord(raw) ?? {};
  if (r.content || r.versions || r.current || r.timeline || r.pendingProposal) {
    return normalizeTimelineDocument(raw);
  }
  if (r.version !== undefined || r.source !== undefined) {
    const version = normalizeTimelineVersion(raw);
    return {
      id: version.timelineId || timelineId,
      projectId: "",
      content: version.content,
      versions: [version],
    } satisfies TimelineDocument;
  }
  return normalizeTimelineDocument({
    id: timelineId,
    content: raw,
    versions: [],
  });
}

export async function createProjectTimeline(
  projectId: string,
  content: TimelineJson,
  title?: string,
): Promise<TimelineDocument> {
  const raw = await apiFetch<unknown>(`/projects/${projectId}/timelines`, {
    method: "POST",
    body: { title, timeline: content },
  });
  return normalizeTimelineDocument(raw);
}

export function renderTimeline(timelineId: string) {
  return apiFetch<EnqueueJobResponse>(`/timelines/${timelineId}/render`, {
    method: "POST",
  });
}

/** Extract rendered preview asset id from RENDER_TIMELINE job.output. */
export function previewAssetIdFromJob(job: Job): string | null {
  const output = asRecord(job.output);
  if (!output) return null;
  if (typeof output.assetId === "string") return output.assetId;
  if (typeof output.renderedAssetId === "string") return output.renderedAssetId;
  if (typeof output.outputAssetId === "string") return output.outputAssetId;
  const nested = asRecord(output.asset);
  if (typeof nested?.id === "string") return nested.id;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Platform Packs (Phase 9) — SDD §5.8 / FR-PLT-*                             */
/* TODO_SHARED: replace with `@creatorai/shared` pack DTOs when Anto lands them */
/* -------------------------------------------------------------------------- */

export type PackAspectRatio = "R_16_9" | "R_9_16" | "R_1_1";
export type PackStatus = "DRAFT" | "READY" | "PUBLISHED";
export type PackPlatform = ScriptPlatform;

export type PlatformPackDto = {
  id: string;
  projectId: string;
  platform: PackPlatform;
  aspectRatio: PackAspectRatio;
  title: string;
  caption: string;
  hashtags: string[];
  status: PackStatus;
  /** Output video/image asset ids from ADAPT_PLATFORM. */
  outputAssetIds: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type PlatformPackListResponse = {
  items: PlatformPackDto[];
};

/** Body for `POST /projects/:id/packs/generate`. */
export type GeneratePacksRequest = {
  platforms: PackPlatform[];
  /** Optional explicit aspects; API may default per platform. */
  aspectRatios?: PackAspectRatio[];
  sourceAssetId?: string;
  timelineId?: string;
};

export type UpdatePackCopyPayload = {
  title?: string;
  caption?: string;
  hashtags?: string[];
};

export type UpdatePackStatusPayload = {
  status: PackStatus;
};

/** Shape for `GET /packs/:id/download` (URLs OK for MVP). */
export type PackDownloadResponse = {
  zipUrl?: string | null;
  urls?: string[];
  files?: Array<{
    name?: string;
    label?: string;
    url: string;
    assetId?: string;
    mime?: string;
  }>;
};

const PACK_ASPECTS: PackAspectRatio[] = ["R_16_9", "R_9_16", "R_1_1"];
const PACK_STATUSES: PackStatus[] = ["DRAFT", "READY", "PUBLISHED"];
const PACK_PLATFORMS: PackPlatform[] = [
  "YOUTUBE",
  "YOUTUBE_SHORTS",
  "INSTAGRAM_REELS",
  "TIKTOK",
  "LINKEDIN",
];

function normalizePackAspect(raw: unknown): PackAspectRatio {
  if (typeof raw === "string") {
    if (PACK_ASPECTS.includes(raw as PackAspectRatio)) {
      return raw as PackAspectRatio;
    }
    const upper = raw.toUpperCase().replace(/[:-]/g, "_");
    if (upper === "16_9" || upper === "R_16_9" || upper === "16X9") return "R_16_9";
    if (upper === "9_16" || upper === "R_9_16" || upper === "9X16") return "R_9_16";
    if (upper === "1_1" || upper === "R_1_1" || upper === "1X1") return "R_1_1";
  }
  return "R_16_9";
}

function normalizePackStatus(raw: unknown): PackStatus {
  if (typeof raw === "string") {
    const upper = raw.toUpperCase() as PackStatus;
    if (PACK_STATUSES.includes(upper)) return upper;
    if (raw.toLowerCase() === "draft") return "DRAFT";
    if (raw.toLowerCase() === "ready") return "READY";
    if (raw.toLowerCase() === "published") return "PUBLISHED";
  }
  return "DRAFT";
}

function normalizePackPlatform(raw: unknown): PackPlatform {
  if (typeof raw === "string" && PACK_PLATFORMS.includes(raw as PackPlatform)) {
    return raw as PackPlatform;
  }
  return "YOUTUBE";
}

function normalizeHashtags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((t) => (typeof t === "string" ? t.trim() : String(t ?? "").trim()))
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeOutputAssetIds(r: Record<string, unknown>): string[] {
  if (Array.isArray(r.outputAssetIds)) {
    return r.outputAssetIds.filter((id): id is string => typeof id === "string");
  }
  if (Array.isArray(r.assetIds)) {
    return r.assetIds.filter((id): id is string => typeof id === "string");
  }
  if (typeof r.outputAssetId === "string") return [r.outputAssetId];
  if (typeof r.renderedAssetId === "string") return [r.renderedAssetId];
  if (typeof r.assetId === "string") return [r.assetId];
  return [];
}

function normalizePlatformPack(raw: unknown): PlatformPackDto {
  const r = asRecord(raw) ?? {};
  return {
    id: String(r.id ?? ""),
    projectId: String(r.projectId ?? ""),
    platform: normalizePackPlatform(r.platform),
    aspectRatio: normalizePackAspect(r.aspectRatio ?? r.aspect),
    title: typeof r.title === "string" ? r.title : "",
    caption:
      typeof r.caption === "string"
        ? r.caption
        : typeof r.description === "string"
          ? r.description
          : "",
    hashtags: normalizeHashtags(r.hashtags ?? r.tags),
    status: normalizePackStatus(r.status),
    outputAssetIds: normalizeOutputAssetIds(r),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}

export function generateProjectPacks(
  projectId: string,
  payload: GeneratePacksRequest,
) {
  return apiFetch<EnqueueJobResponse>(`/projects/${projectId}/packs/generate`, {
    method: "POST",
    body: payload,
  });
}

export async function listProjectPacks(projectId: string) {
  const raw = await apiFetch<{ items?: unknown[] } | unknown[]>(
    `/projects/${projectId}/packs`,
  );
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.items)
      ? raw.items
      : [];
  return {
    items: items.map(normalizePlatformPack),
  } satisfies PlatformPackListResponse;
}

/** PATCH `/packs/:id` — copy fields (title / caption / hashtags). */
export async function updatePackCopy(
  packId: string,
  payload: UpdatePackCopyPayload,
) {
  const raw = await apiFetch<unknown>(`/packs/${packId}`, {
    method: "PATCH",
    body: payload,
  });
  return normalizePlatformPack(raw);
}

/** PATCH `/packs/:id/status` — Draft / Ready / Published (SDD §5.8). */
export async function updatePackStatus(
  packId: string,
  payload: UpdatePackStatusPayload,
) {
  // API Zod (`packStatusSchema`) expects lowercase; UI keeps DRAFT|READY|PUBLISHED.
  const status = payload.status.toLowerCase() as "draft" | "ready" | "published";
  const raw = await apiFetch<unknown>(`/packs/${packId}/status`, {
    method: "PATCH",
    body: { status },
  });
  return normalizePlatformPack(raw);
}

export function getPackDownload(packId: string) {
  return apiFetch<PackDownloadResponse>(`/packs/${packId}/download`);
}

export function deletePack(packId: string) {
  return apiFetch<{ id: string; deleted: true }>(`/packs/${packId}`, {
    method: "DELETE",
  });
}

export function getPackDownloadUrl(packId: string): string {
  const token = getToken();
  return `${API_BASE_URL}/packs/${packId}/download-file${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export function getAssetDownloadUrl(assetId: string): string {
  const token = getToken();
  return `${API_BASE_URL}/assets/${assetId}/content${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export async function downloadAssetFile(
  assetId: string,
  suggestedName?: string,
): Promise<void> {
  const token = getToken();
  const url = getAssetDownloadUrl(assetId);
  let filename = suggestedName || `asset-${assetId}.mp4`;

  try {
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    const disposition = response.headers.get("content-disposition");
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/i);
      if (match?.[1]) filename = match[1];
    }
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 15_000);
  } catch {
    // Direct link fallback
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export async function downloadPackFile(
  packId: string,
  suggestedName?: string,
): Promise<void> {
  const token = getToken();
  const url = getPackDownloadUrl(packId);
  let filename = suggestedName || `pack-${packId}.mp4`;

  try {
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    const disposition = response.headers.get("content-disposition");
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/i);
      if (match?.[1]) filename = match[1];
    }
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 15_000);
  } catch {
    // Direct link fallback
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10_000);
}

export {
  buildClipPrompt,
  formatAllScenePrompts,
  STYLE_LABELS,
  CAMERA_LABELS,
  type ClipPromptStyle,
  type ClipPromptCamera,
  type ClipPromptOptions,
} from "@/components/mapping/clip-prompt";
