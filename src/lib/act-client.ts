/**
 * Client-side helper to call the Railway Nova Act service directly.
 * Bypasses Vercel serverless timeout limits — Railway has no execution cap.
 */

let _base = (process.env.NEXT_PUBLIC_ACT_SERVICE_URL ?? "").trim().replace(/\/$/, "");
if (_base && !/^https?:\/\//i.test(_base)) _base = `https://${_base}`;
const ACT_BASE_URL = _base;

export function isActServiceConfigured(): boolean {
  return Boolean(ACT_BASE_URL);
}

export async function callActDirect<T>(
  path: string,
  body: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<T> {
  if (!ACT_BASE_URL) {
    throw new Error("ACT service not configured");
  }
  const url = `${ACT_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const ms = options?.timeoutMs ?? 300_000; // 5 min default
  const timer = setTimeout(() => controller.abort(), ms);

  // Forward external abort signal
  if (options?.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Act service returned ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  }
}
