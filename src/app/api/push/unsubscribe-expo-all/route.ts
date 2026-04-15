import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbGetExpoPushTokens, dbDeleteExpoPushToken } from "@/lib/db";

export async function POST(req: NextRequest) {
  const userId = await getUserId(req.headers);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tokens = await dbGetExpoPushTokens(userId);
  await Promise.all(tokens.map((t) => dbDeleteExpoPushToken(userId, t.token)));
  return NextResponse.json({ ok: true, removed: tokens.length });
}
