import { cookies } from "next/headers";

const COOKIE_NAME = "recomp_uid";
const USER_ID_HEADER = "x-recomp-user-id";

/**
 * Get user ID from request. Supports:
 * - Cookie (web)
 * - X-Recomp-User-Id header (mobile / API clients)
 */
export async function getUserId(headers?: Headers): Promise<string | null> {
  if (headers) {
    const id = headers.get(USER_ID_HEADER);
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
  return `${COOKIE_NAME}=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
