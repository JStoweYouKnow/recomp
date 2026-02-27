import { NextRequest, NextResponse } from "next/server";
import { buildSetCookieHeader } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

/** Demo user ID — matches buildDemoSeed() profile.id so AI routes accept requests when REQUIRE_AUTH_FOR_AI=true */
const DEMO_USER_ID = "demo-user-001";

/**
 * Sets auth cookie for pre-seeded demo user. Call when "Try pre-seeded demo" is clicked
 * so AI routes (Weekly Review, Reco, meal suggest, etc.) work even with REQUIRE_AUTH_FOR_AI=true.
 */
export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "auth-demo"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const res = NextResponse.json({ ok: true, userId: DEMO_USER_ID });
  res.headers.set("Set-Cookie", buildSetCookieHeader(DEMO_USER_ID));
  return res;
}
