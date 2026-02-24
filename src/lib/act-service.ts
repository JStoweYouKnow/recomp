/**
 * Call the remote Nova Act service when ACT_SERVICE_URL is set.
 * Used for production (Vercel) where local Python doesn't run.
 */
export async function callActService<T>(
  path: string,
  body: unknown,
  options?: { timeoutMs?: number }
): Promise<T | null> {
  let base = process.env.ACT_SERVICE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 90_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}
