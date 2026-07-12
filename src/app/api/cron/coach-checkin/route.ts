import { NextRequest, NextResponse } from "next/server";
import {
  dbScanUsersWithCoachSchedules,
  dbGetProfile,
  dbGetMeals,
  dbSaveCoachSchedule,
} from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import { invokeNova } from "@/lib/nova";
import { logError } from "@/lib/logger";

export const maxDuration = 300;

const SYSTEM = `You are The Ref, a proactive AI fitness coach. Generate a brief, personalized check-in message.

Keep it to 2-3 sentences. Conversational, not robotic. Use their name.
Celebrate consistency. If they haven't logged today: be curious, not judgmental.
Return JSON: { "message": string, "tone": "encouraging"|"neutral"|"confrontational" }`;

function verifyCronSecret(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && auth === `Bearer ${secret}`);
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Match HH:mm times whose hour matches current UTC hour, e.g. "08:00", "08:30"
  const currentHourPrefix = `${String(now.getUTCHours()).padStart(2, "0")}:`;

  const allSchedules = await dbScanUsersWithCoachSchedules();

  const toNotify = allSchedules.filter(({ schedule }) => {
    if (!schedule.checkInTimes?.length) return false;
    const hourMatches = schedule.checkInTimes.some((t) => t.startsWith(currentHourPrefix));
    if (!hourMatches) return false;
    // Skip if already notified within the last 50 minutes (prevents double-send on retries)
    if (schedule.lastCheckIn) {
      const msSinceLast = now.getTime() - new Date(schedule.lastCheckIn).getTime();
      if (msSinceLast < 50 * 60 * 1000) return false;
    }
    return true;
  });

  const results = await Promise.allSettled(
    toNotify.map(async ({ userId, schedule }) => {
      const [profile, meals] = await Promise.all([
        dbGetProfile(userId),
        dbGetMeals(userId),
      ]);

      const todayStr = now.toISOString().slice(0, 10);
      const todayMeals = meals.filter((m) => m.date === todayStr).length;
      const totalProteinToday = meals
        .filter((m) => m.date === todayStr)
        .reduce((sum, m) => sum + (m.macros?.protein ?? 0), 0);

      const prompt = `User: ${profile?.name ?? "there"}
Goal: ${profile?.goal ?? "general fitness"}
Meals logged today: ${todayMeals}
Protein today: ${Math.round(totalProteinToday)}g

Generate a check-in message.`;

      let message = "Hey! How's your day going? Keep up the great work and don't forget to log your meals.";
      try {
        const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.8, maxTokens: 200 });
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { message: string };
          if (parsed.message) message = parsed.message;
        }
      } catch (err) {
        logError("Coach check-in Nova call failed", err, { userId });
      }

      await sendPushToUser(userId, {
        title: "The Ref",
        body: message,
        tag: "rico-checkin",
        data: { url: "/?open=rico" },
      });

      await dbSaveCoachSchedule(userId, { ...schedule, lastCheckIn: now.toISOString() });
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ dispatched: toNotify.length, succeeded, scanned: allSchedules.length });
}
