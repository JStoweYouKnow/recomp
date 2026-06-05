import { cookies } from "next/headers";
import { dbGetUserIdByApiToken } from "@/lib/db";

const COOKIE_NAME = "recomp_uid";

/**
 * When set (e.g. `.myapp.com`), the session cookie is sent on both `myapp.com`
 * and `www.myapp.com`, fixing "different data on phone vs laptop" when users
 * hit different hostnames. Omit to scope the cookie to the exact host only.
 */
export function getAuthCookieDomain(): string | undefined {
  const d = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return d || undefined;
}

/**
 * Get user ID from request. Supports:
 * - Authorization: Bearer <token> (mobile / API clients — token validated against DB)
 * - Session cookie (web)
 *
 * The previous X-Refactor-User-Id header is intentionally removed: it accepted
 * an arbitrary user ID with no verification, allowing any caller to impersonate
 * any account by setting that header.
 */
export async function getUserId(headers?: Headers): Promise<string | null> {
  if (headers) {
    const auth = headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();
      const userId = await dbGetUserIdByApiToken(token);
      if (userId) return userId;
    }
  }
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export function getSecureCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

export function buildSetCookieHeader(userId: string): string {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const domain = getAuthCookieDomain();
  const domainPart = domain ? `; Domain=${domain}` : "";
  return `${COOKIE_NAME}=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}${domainPart}`;
}
