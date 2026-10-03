const TOKEN_KEY = "creatorai_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event("creatorai-auth"));
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("creatorai-auth"));
}

export function hasToken(): boolean {
  return Boolean(getToken());
}
