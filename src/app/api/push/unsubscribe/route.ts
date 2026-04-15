import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbDeletePushSubscription } from "@/lib/db";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  if (!endpoint || typeof endpoint !== "string") {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await dbDeletePushSubscription(userId, endpoint);
  return NextResponse.json({ ok: true });
}
