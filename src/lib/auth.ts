import { cookies } from "next/headers";

const COOKIE_NAME = "recomp_uid";
const USER_ID_HEADER = "x-refactor-user-id";

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
 * - Cookie (web)
 * - X-Refactor-User-Id header (mobile / API clients)
 */
export async function getUserId(headers?: Headers): Promise<string | null> {
  if (headers) {
    const id = headers.get(USER_ID_HEADER)?.trim();
    if (id) return id;
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
