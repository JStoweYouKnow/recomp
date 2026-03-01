import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbGetGroup, dbAddGroupMember, dbGetUserGroups, dbUpdateGroup } from "@/lib/db";

const MAX_MEMBERS = 50;

type Params = { params: Promise<{ groupId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-join"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;
  const group = await dbGetGroup(groupId);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (group.accessMode === "invite_only") {
    return NextResponse.json({ error: "This group requires an invite code" }, { status: 403 });
  }

  // Check if already a member
  const userGroups = await dbGetUserGroups(userId);
  if (userGroups.some((g) => g.groupId === groupId)) {
    return NextResponse.json({ error: "Already a member" }, { status: 409 });
  }

  if (group.memberCount >= MAX_MEMBERS) {
    return NextResponse.json({ error: "Group is full" }, { status: 409 });
  }

  await dbAddGroupMember(groupId, userId, "member", group.name);
  await dbUpdateGroup(groupId, { memberCount: group.memberCount + 1 });

  return NextResponse.json({ ok: true });
}
