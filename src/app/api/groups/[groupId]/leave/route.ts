import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbGetGroup, dbRemoveGroupMember, dbUpdateGroup } from "@/lib/db";

type Params = { params: Promise<{ groupId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-leave"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;
  const group = await dbGetGroup(groupId);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (group.creatorId === userId) {
    return NextResponse.json({ error: "Group owner cannot leave. Delete the group instead." }, { status: 400 });
  }

  await dbRemoveGroupMember(groupId, userId);
  await dbUpdateGroup(groupId, { memberCount: Math.max(0, group.memberCount - 1) });

  return NextResponse.json({ ok: true });
}
