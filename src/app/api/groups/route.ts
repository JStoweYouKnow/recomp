import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import {
  dbCreateGroup,
  dbAddGroupMember,
  dbGetUserGroups,
  dbSetInviteCode,
  dbAddToGroupsIndex,
} from "@/lib/db";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { randomBytes } from "crypto";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  goalType: z.enum(["lose_weight", "build_muscle", "consistency", "macro_targets", "custom"]),
  goalDescription: z.string().max(300).optional(),
  accessMode: z.enum(["open", "invite_only"]),
  trackingMode: z.enum(["aggregate", "leaderboard", "both"]),
});

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-create"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const groupId = uuidv4();
  const inviteCode = parsed.data.accessMode === "invite_only"
    ? randomBytes(6).toString("base64url")
    : undefined;

  const group = {
    id: groupId,
    ...parsed.data,
    inviteCode,
    creatorId: userId,
    memberCount: 1,
    createdAt: new Date().toISOString(),
  };

  await dbCreateGroup(group);
  await dbAddGroupMember(groupId, userId, "owner", group.name);

  if (inviteCode) {
    await dbSetInviteCode(groupId, inviteCode);
  }

  if (group.accessMode === "open") {
    await dbAddToGroupsIndex(group);
  }

  return NextResponse.json(group, { status: 201 });
}

export async function GET(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-list"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const groups = await dbGetUserGroups(userId);
  return NextResponse.json(groups);
}
