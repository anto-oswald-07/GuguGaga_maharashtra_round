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
