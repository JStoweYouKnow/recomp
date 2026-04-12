import { API_BASE_URL } from "./config";
import { captureError } from "./sentry";

const USER_ID_HEADER = "x-recomp-user-id";
const MAX_RETRIES_429 = 3;
const BASE_DELAY_429 = 2000;

/**
 * Get stored userId for API requests.
 * Set by auth store after register; backend must accept this header when cookie absent.
 */
let getStoredUserId: (() => Promise<string | null>) | null = null;
export function setUserIdGetter(fn: () => Promise<string | null>) {
  getStoredUserId = fn;
}

/** Callback invoked when a 401 is received — triggers logout flow. */
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(fn: () => void) {
  onUnauthorized = fn;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (getStoredUserId) {
    const userId = await getStoredUserId();
    if (userId) headers[USER_ID_HEADER] = userId;
  }
  return headers;
}

/** Sleep helper for backoff. */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core fetch with 401 interception and 429 retry with exponential backoff.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE_URL}${path}`;
  const headers = await getAuthHeaders();
  const merged: RequestInit = {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  };

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
    const res = await fetch(url, merged);

    // Handle 401 — session expired
    if (res.status === 401) {
      onUnauthorized?.();
      return res;
    }

    // Handle 429 — rate limited, retry with backoff
    if (res.status === 429 && attempt < MAX_RETRIES_429) {
      const retryAfter = res.headers.get("Retry-After");
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_429 * Math.pow(2, attempt);
      await sleep(Math.min(delayMs, 30000));
      lastResponse = res;
      continue;
    }

    return res;
  }

  // All retries exhausted
  return lastResponse!;
}

/** FormData upload (no Content-Type - browser sets boundary). */
export async function apiFormData(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {};
  if (getStoredUserId) {
    const userId = await getStoredUserId();
    if (userId) headers["X-Recomp-User-Id"] = userId;
  }
  const merged: RequestInit = {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  };

  const res = await fetch(url, merged);
  if (res.status === 401) {
    onUnauthorized?.();
  }
  return res;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || `HTTP ${res.status}`);
    captureError(err, { path, status: res.status });
    throw err;
  }
  return res.json();
}
