import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbSaveExpoPushToken } from "@/lib/db";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const EXPO_TOKEN_PREFIX = "ExponentPushToken[";

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(
    getClientKey(getRequestIp(req), "push-subscribe-expo"),
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

  let body: { expoPushToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.expoPushToken;
  if (
    !token ||
    typeof token !== "string" ||
    (!token.startsWith(EXPO_TOKEN_PREFIX) && !token.startsWith("ExpoPushToken["))
  ) {
    return NextResponse.json(
      { error: "Valid Expo push token required" },
      { status: 400 }
    );
  }

  await dbSaveExpoPushToken(userId, token);
  return NextResponse.json({ ok: true });
}
