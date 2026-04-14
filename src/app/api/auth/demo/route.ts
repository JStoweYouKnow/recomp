import { NextRequest, NextResponse } from "next/server";
import { buildSetCookieHeader } from "@/lib/auth";
import { buildDemoSeed } from "@/lib/demoSeed";
import { isJudgeMode } from "@/lib/judgeMode";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

export async function POST(_req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(_req), "auth-demo"), 40, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (isJudgeMode()) {
    return NextResponse.json({ authenticated: false, userId: null, profile: null });
  }

  const { profile } = buildDemoSeed();
  const res = NextResponse.json({
    authenticated: true,
    userId: profile.id,
    profile,
  });
  res.headers.append("Set-Cookie", buildSetCookieHeader(profile.id));
  return res;
}
