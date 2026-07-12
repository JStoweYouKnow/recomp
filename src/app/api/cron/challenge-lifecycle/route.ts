import { NextRequest, NextResponse } from "next/server";
import { dbScanAllChallenges, dbCreateChallenge } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import type { Challenge } from "@/lib/types";
import { logError } from "@/lib/logger";

export const maxDuration = 300;

function verifyCronSecret(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && auth === `Bearer ${secret}`);
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const all = await dbScanAllChallenges();

  let started = 0;
  let completed = 0;

  for (const challenge of all) {
    try {
      if (challenge.status === "pending" && challenge.startDate <= today) {
        const updated: Challenge = { ...challenge, status: "active" };
        await dbCreateChallenge(updated);
        started++;

        await Promise.allSettled(
          challenge.participants.map(({ userId }) =>
            sendPushToUser(userId, {
              title: "Challenge is live!",
              body: `"${challenge.title}" has started. Time to put in the work.`,
              tag: `challenge-start-${challenge.id}`,
              data: { url: "/?tab=groups" },
            })
          )
        );
      } else if (challenge.status === "active" && challenge.endDate < today) {
        const ranked = [...challenge.participants].sort((a, b) => b.score - a.score);
        const winner = ranked[0];
        const updated: Challenge = { ...challenge, status: "completed" };
        await dbCreateChallenge(updated);
        completed++;

        await Promise.allSettled(
          challenge.participants.map(({ userId }) => {
            const isWinner = userId === winner?.userId;
            return sendPushToUser(userId, {
              title: isWinner ? "You won the challenge!" : "Challenge complete",
              body: isWinner
                ? `You topped "${challenge.title}". Well earned.`
                : `"${challenge.title}" is done. ${winner?.name ?? "Your teammate"} came out on top.`,
              tag: `challenge-end-${challenge.id}`,
              data: { url: "/?tab=groups" },
            });
          })
        );
      }
    } catch (err) {
      logError("Challenge lifecycle update failed", err, { challengeId: challenge.id });
    }
  }

  return NextResponse.json({ scanned: all.length, started, completed });
}
