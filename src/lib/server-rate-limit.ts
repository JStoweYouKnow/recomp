type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
};

export type RateLimitHeaderValues = {
  limit: string;
  remaining: string;
  reset: string;
  retryAfter: string;
};

export function getClientKey(ipOrId: string | null, routeKey: string): string {
  const client = (ipOrId ?? "unknown").trim() || "unknown";
  return `${routeKey}:${client}`;
}

export function fixedWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, limit, resetAt };
  }

  existing.count += 1;
  buckets.set(key, existing);

  if (existing.count > limit) {
    return { ok: false, remaining: 0, limit, resetAt: existing.resetAt };
  }

  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    limit,
    resetAt: existing.resetAt,
  };
}

export function getRequestIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export function getRateLimitHeaderValues(
  result: RateLimitResult,
  now = Date.now()
): RateLimitHeaderValues {
  const resetSeconds = Math.max(0, Math.ceil((result.resetAt - now) / 1000));
  return {
    limit: String(result.limit),
    remaining: String(Math.max(0, result.remaining)),
    reset: String(resetSeconds),
    retryAfter: String(resetSeconds),
  };
}

// Test helper for deterministic rate-limit tests.
export function __resetRateLimitBuckets(): void {
  buckets.clear();
}
