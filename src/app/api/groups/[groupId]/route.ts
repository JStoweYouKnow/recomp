import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import {
  dbGetGroup,
  dbUpdateGroup,
  dbDeleteGroup,
  dbGetGroupMembers,
  dbRemoveFromGroupsIndex,
  dbDeleteInviteCode,
  dbRemoveGroupMember,
} from "@/lib/db";
import { z } from "zod";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-detail"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;
  const group = await dbGetGroup(groupId);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const members = await dbGetGroupMembers(groupId);

  return NextResponse.json({ group, members });
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  trackingMode: z.enum(["aggregate", "leaderboard", "both"]).optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-update"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;
  const group = await dbGetGroup(groupId);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (group.creatorId !== userId) return NextResponse.json({ error: "Not the group owner" }, { status: 403 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  await dbUpdateGroup(groupId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-delete"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;
  const group = await dbGetGroup(groupId);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (group.creatorId !== userId) return NextResponse.json({ error: "Not the group owner" }, { status: 403 });

  // Delete all items under GROUP#{groupId} partition + reverse USER# lookups
  await dbDeleteGroup(groupId);

  // Remove from discovery index (pass goalType for fast single-shard delete) and invite code
  await dbRemoveFromGroupsIndex(groupId, group.goalType);
  if (group.inviteCode) await dbDeleteInviteCode(group.inviteCode);

  return NextResponse.json({ ok: true });
}
