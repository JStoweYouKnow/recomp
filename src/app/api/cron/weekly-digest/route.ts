import { NextRequest, NextResponse } from "next/server";
import {
  dbScanUsersWithCoachSchedules,
  dbGetProfile,
  dbGetMeals,
  dbGetWeeklyReview,
  dbSaveWeeklyReview,
} from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import { invokeNova } from "@/lib/nova";
import { logError } from "@/lib/logger";

export const maxDuration = 300;

const DIGEST_SYSTEM = `You are The Ref, an AI fitness coach generating a user's weekly recap.

Analyze the meal data and produce a concise JSON summary:
{
  "summary": "2-sentence high-level recap — what went well, what needs attention",
  "topWin": "1 specific concrete win from this week",
  "topFocus": "1 concrete, actionable focus for next week",
  "weeklyScore": number from 1-10
}

Be specific to the data. Avoid generic advice. Reference actual numbers when available.`;

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
  // JS getDay(): 0=Sunday, 1=Monday ... 6=Saturday
  // CoachSchedule.weeklyReviewDay 0-6 follows the same convention
  const todayDow = now.getDay();
  const todayStr = now.toISOString().slice(0, 10);
  const weekCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const allSchedules = await dbScanUsersWithCoachSchedules();
  const toProcess = allSchedules.filter(({ schedule }) => schedule.weeklyReviewDay === todayDow);

  const results = await Promise.allSettled(
    toProcess.map(async ({ userId }) => {
      // Skip if already generated today
      const existing = await dbGetWeeklyReview(userId);
      if (existing?.createdAt?.startsWith(todayStr)) return;

      const [profile, meals] = await Promise.all([
        dbGetProfile(userId),
        dbGetMeals(userId),
      ]);

      const weekMeals = meals.filter((m) => m.date >= weekCutoff);
      const daysCovered = new Set(weekMeals.map((m) => m.date)).size;
      const totalCalories = weekMeals.reduce((sum, m) => sum + (m.macros?.calories ?? 0), 0);
      const totalProtein = weekMeals.reduce((sum, m) => sum + (m.macros?.protein ?? 0), 0);
      const avgCalories = daysCovered > 0 ? Math.round(totalCalories / daysCovered) : 0;
      const avgProtein = daysCovered > 0 ? Math.round(totalProtein / daysCovered) : 0;

      const prompt = `User: ${profile?.name ?? "there"}
Goal: ${profile?.goal ?? "general fitness"}
Days logged this week: ${daysCovered}/7
Total meals logged: ${weekMeals.length}
Average daily calories: ${avgCalories} kcal
Average daily protein: ${avgProtein}g

Generate the weekly digest.`;

      let summary = "Another week in the books. Keep showing up.";
      let topWin = "You logged your meals.";
      let topFocus = "Stay consistent next week.";
      let weeklyScore = 5;

      try {
        const raw = await invokeNova(DIGEST_SYSTEM, prompt, { temperature: 0.7, maxTokens: 350 });
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            summary: string;
            topWin: string;
            topFocus: string;
            weeklyScore: number;
          };
          if (parsed.summary) summary = parsed.summary;
          if (parsed.topWin) topWin = parsed.topWin;
          if (parsed.topFocus) topFocus = parsed.topFocus;
          if (typeof parsed.weeklyScore === "number") weeklyScore = parsed.weeklyScore;
        }
      } catch (err) {
        logError("Weekly digest Nova call failed", err, { userId });
      }

      await dbSaveWeeklyReview(userId, {
        id: `${userId}-${todayStr}`,
        createdAt: now.toISOString(),
        summary,
        mealAnalysis: `Win: ${topWin}`,
        wearableInsights: "",
        recommendations: [topFocus],
        reasoning: `Weekly score: ${weeklyScore}/10. ${daysCovered}/7 days logged, avg ${avgCalories} kcal/day, avg ${avgProtein}g protein/day.`,
        agentSteps: [],
      });

      // Push teaser — first ~110 chars of summary
      const pushBody = summary.length > 110 ? summary.slice(0, 107) + "…" : summary;
      await sendPushToUser(userId, {
        title: "Your weekly recap is ready",
        body: pushBody,
        tag: "weekly-digest",
        data: { url: "/?open=weekly-review" },
      });
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ processed: toProcess.length, succeeded, scanned: allSchedules.length });
}
