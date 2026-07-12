import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbSaveFcmPushToken } from "@/lib/db";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

function isValidFcmRegistrationToken(token: string): boolean {
  if (token.length < 80 || token.length > 4096) return false;
  if (/\s/.test(token)) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(
    getClientKey(getRequestIp(req), "push-subscribe-fcm"),
    5,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const userId = await getUserId(req.headers);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token;
  if (!token || typeof token !== "string" || !isValidFcmRegistrationToken(token)) {
    return NextResponse.json({ error: "Valid FCM registration token required" }, { status: 400 });
  }

  await dbSaveFcmPushToken(userId, token);
  return NextResponse.json({ ok: true });
}
