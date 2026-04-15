import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbGetChallenge, dbCreateChallenge, dbAddUserChallenge } from "@/lib/db";
import { logError } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "challenge-join"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { challengeId, userName } = await req.json();
    if (!challengeId) return NextResponse.json({ error: "Challenge ID required" }, { status: 400 });

    const challenge = await dbGetChallenge(challengeId);
    if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    if (challenge.participants.some((p) => p.userId === userId)) {
      return NextResponse.json({ error: "Already joined" }, { status: 400 });
    }

    if (challenge.status !== "active" && challenge.status !== "pending") {
      return NextResponse.json({ error: "Challenge is not joinable" }, { status: 400 });
    }

    const updated = {
      ...challenge,
      participants: [...challenge.participants, { userId, name: userName ?? "Participant", progress: 0, score: 0 }],
    };

    await dbCreateChallenge(updated);
    await dbAddUserChallenge(userId, updated);

    return NextResponse.json({ challenge: updated });
  } catch (err) {
    logError("Challenge join failed", err, { route: "challenges/join" });
    return NextResponse.json({ error: "Failed to join challenge" }, { status: 500 });
  }
}
