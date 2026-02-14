import { cookies } from "next/headers";

const COOKIE_NAME = "recomp_uid";

export async function getUserId(): Promise<string | null> {
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
