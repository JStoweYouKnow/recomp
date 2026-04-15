import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbGetChallenge, dbUpdateChallengeProgress } from "@/lib/db";
import { logError } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "challenge-progress"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { challengeId, progress, score } = await req.json();
    if (!challengeId) return NextResponse.json({ error: "Challenge ID required" }, { status: 400 });

    const challenge = await dbGetChallenge(challengeId);
    if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    if (challenge.status !== "active") {
      return NextResponse.json({ error: "Challenge is not active" }, { status: 400 });
    }

    await dbUpdateChallengeProgress(challengeId, userId, progress ?? 0, score ?? 0);

    // Check if challenge should complete (past end date)
    if (new Date(challenge.endDate) < new Date()) {
      const { dbCreateChallenge } = await import("@/lib/db");
      await dbCreateChallenge({ ...challenge, status: "completed" });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("Challenge progress failed", err, { route: "challenges/progress" });
    return NextResponse.json({ error: "Failed to update progress" }, { status: 500 });
  }
}
