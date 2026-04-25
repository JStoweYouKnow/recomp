import { NextRequest, NextResponse } from "next/server";
import { buildSetCookieHeader } from "@/lib/auth";
import { dbGetProfile } from "@/lib/db";
import { buildDemoSeed } from "@/lib/demoSeed";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const DEMO_USER_ID = "demo-user-001";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "auth-demo"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  let profile = null;
  try {
    profile = await dbGetProfile(DEMO_USER_ID);
  } catch {
    // DynamoDB unavailable — fall through to seed fallback below.
  }

  // Always return a profile so the iOS app can set isAuthenticated = true.
  if (!profile) {
    profile = buildDemoSeed().profile;
  }

  const res = NextResponse.json({
    authenticated: true,
    userId: DEMO_USER_ID,
    profile,
  });
  res.headers.set("Set-Cookie", buildSetCookieHeader(DEMO_USER_ID));
  return res;
}
