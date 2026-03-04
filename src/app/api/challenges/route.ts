import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbGetUserChallenges } from "@/lib/db";
import type { Challenge } from "@/lib/types";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const challenges = await dbGetUserChallenges(userId);
    const enriched: (Challenge & { myProgress: number; myScore: number })[] = challenges.map((c) => {
      const me = c.participants.find((p) => p.userId === userId);
      return { ...c, myProgress: me?.progress ?? 0, myScore: me?.score ?? 0 };
    });
    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
