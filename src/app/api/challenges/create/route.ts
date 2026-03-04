import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbCreateChallenge, dbAddUserChallenge } from "@/lib/db";
import { logError } from "@/lib/logger";
import type { Challenge } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "challenge-create"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { title, description, type, metric, target, startDate, endDate, stakes, groupId, userName } = await req.json();

    if (!title || !metric || !target || !startDate || !endDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const challenge: Challenge = {
      id: crypto.randomUUID(),
      type: type ?? "solo",
      title,
      description: description ?? "",
      metric,
      target,
      startDate,
      endDate,
      stakes,
      participants: [{ userId, name: userName ?? "You", progress: 0, score: 0 }],
      status: "active",
      createdBy: userId,
      groupId,
    };

    await dbCreateChallenge(challenge);
    await dbAddUserChallenge(userId, challenge);

    return NextResponse.json({ challenge });
  } catch (err) {
    logError("Challenge create failed", err, { route: "challenges/create" });
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
