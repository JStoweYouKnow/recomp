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

/** Use Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set; otherwise in-memory. */
export async function fixedWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): Promise<RateLimitResult> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    try {
      const { Ratelimit } = await import("@upstash/ratelimit");
      const { Redis } = await import("@upstash/redis");
      const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
      const limiter = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.fixedWindow(limit, `${windowSec} s`),
        prefix: "recomp-rl",
      });
      const { success, remaining, limit: lim, reset } = await limiter.limit(key);
      return {
        ok: success,
        remaining,
        limit: lim,
        resetAt: reset * 1000,
      };
    } catch (err) {
      console.warn("Upstash rate limit failed, falling back to in-memory:", err instanceof Error ? err.message : err);
    }
  }

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

/** Test helper for deterministic rate-limit tests. Resets in-memory buckets only. */
export function __resetRateLimitBuckets(): void {
  buckets.clear();
}
