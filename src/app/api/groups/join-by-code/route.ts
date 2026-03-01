import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbGetGroupByInviteCode, dbGetGroup, dbAddGroupMember, dbGetUserGroups, dbUpdateGroup } from "@/lib/db";
import { z } from "zod";

const MAX_MEMBERS = 50;

const schema = z.object({
  code: z.string().min(1).max(20),
});

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-join-code"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const groupId = await dbGetGroupByInviteCode(parsed.data.code);
  if (!groupId) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });

  const group = await dbGetGroup(groupId);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const userGroups = await dbGetUserGroups(userId);
  if (userGroups.some((g) => g.groupId === groupId)) {
    return NextResponse.json({ error: "Already a member", groupId }, { status: 409 });
  }

  if (group.memberCount >= MAX_MEMBERS) {
    return NextResponse.json({ error: "Group is full" }, { status: 409 });
  }

  await dbAddGroupMember(groupId, userId, "member", group.name);
  await dbUpdateGroup(groupId, { memberCount: group.memberCount + 1 });

  return NextResponse.json({ ok: true, groupId, groupName: group.name });
}
