import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbDeleteExpoPushToken } from "@/lib/db";

export async function POST(req: NextRequest) {
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
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Expo push token required" },
      { status: 400 }
    );
  }

  await dbDeleteExpoPushToken(userId, token);
  return NextResponse.json({ ok: true });
}
