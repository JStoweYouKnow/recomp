import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbListOpenGroups } from "@/lib/db";

export async function GET(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-discover"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const groups = await dbListOpenGroups();
  return NextResponse.json(groups);
}
