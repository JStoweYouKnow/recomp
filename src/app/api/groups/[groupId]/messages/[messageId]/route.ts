import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbDeleteGroupMessage, dbGetUserGroups } from "@/lib/db";

type Params = { params: Promise<{ groupId: string; messageId: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-msg-delete"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId, messageId } = await params;
  const timestamp = req.nextUrl.searchParams.get("ts");
  if (!timestamp) return NextResponse.json({ error: "Missing timestamp" }, { status: 400 });

  // Verify membership
  const userGroups = await dbGetUserGroups(userId);
  if (!userGroups.some((g) => g.groupId === groupId)) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  await dbDeleteGroupMessage(groupId, messageId, timestamp);
  return NextResponse.json({ ok: true });
}
