import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbGetGroupProgress, dbGetUserGroups, dbGetGroup } from "@/lib/db";
import type { GroupMemberProgress } from "@/lib/types";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-progress"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;

  // Verify membership
  const userGroups = await dbGetUserGroups(userId);
  if (!userGroups.some((g) => g.groupId === groupId)) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const group = await dbGetGroup(groupId);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const progress = await dbGetGroupProgress(groupId);

  // Compute aggregate stats
  const aggregate = {
    totalXp: progress.reduce((sum, p) => sum + p.xp, 0),
    averageStreak: progress.length > 0 ? Math.round(progress.reduce((sum, p) => sum + p.streakLength, 0) / progress.length) : 0,
    averageMacroHitRate: progress.length > 0 ? Math.round(progress.reduce((sum, p) => sum + p.macroHitRate, 0) / progress.length) : 0,
    memberCount: progress.length,
  };

  // Sort by XP for leaderboard
  const leaderboard: GroupMemberProgress[] = [...progress].sort((a, b) => b.xp - a.xp);

  return NextResponse.json({
    trackingMode: group.trackingMode,
    aggregate,
    leaderboard,
  });
}
