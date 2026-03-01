import { NextRequest, NextResponse } from "next/server";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import {
  dbGetUserIdByUsername,
  dbGetProfile,
  dbGetSocialSettings,
  dbGetMilestones,
  dbGetMeta,
  dbGetMeals,
  dbGetPlan,
} from "@/lib/db";
import type { PublicProfile, Macros } from "@/lib/types";

function xpToLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ usernameOrId: string }> }) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "public-profile"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { usernameOrId } = await params;
  if (!usernameOrId) return NextResponse.json({ error: "Missing identifier" }, { status: 400 });

  // Try username first, then treat as userId
  let userId = await dbGetUserIdByUsername(usernameOrId);
  if (!userId) {
    // Check if it's a direct userId by trying to load profile
    const directProfile = await dbGetProfile(usernameOrId);
    if (directProfile) userId = usernameOrId;
  }
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [profile, settings, milestones, meta] = await Promise.all([
    dbGetProfile(userId),
    dbGetSocialSettings(userId),
    dbGetMilestones(userId),
    dbGetMeta(userId),
  ]);

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const visibility = settings?.visibility ?? "badges_only";
  const username = settings?.username ?? userId;

  const publicProfile: PublicProfile = {
    username,
    name: profile.name,
    avatarDataUrl: profile.avatarDataUrl,
    goal: profile.goal,
    visibility,
    badges: milestones,
    xp: meta.xp,
    xpLevel: xpToLevel(meta.xp),
  };

  // badges_stats: add summary stats
  if (visibility === "badges_stats" || visibility === "full_transparency") {
    const meals = await dbGetMeals(userId);
    const plan = await dbGetPlan(userId);

    // Compute streak
    const mealDates = new Set(meals.map((m) => m.date));
    const sortedDates = Array.from(mealDates).sort().reverse();
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      const expStr = expected.toISOString().slice(0, 10);
      if (sortedDates.includes(expStr)) streak++;
      else break;
    }
    publicProfile.streakLength = streak;

    // Weeks active
    const createdAt = new Date(profile.createdAt);
    const weeksActive = Math.max(1, Math.ceil((Date.now() - createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    publicProfile.weeksActive = weeksActive;

    // Macro hit rate (days where all macros were within 10% of target)
    if (plan?.dietPlan?.dailyTargets) {
      const targets = plan.dietPlan.dailyTargets;
      const mealsByDate = new Map<string, Macros>();
      for (const meal of meals) {
        const existing = mealsByDate.get(meal.date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
        existing.calories += meal.macros.calories;
        existing.protein += meal.macros.protein;
        existing.carbs += meal.macros.carbs;
        existing.fat += meal.macros.fat;
        mealsByDate.set(meal.date, existing);
      }
      let hitDays = 0;
      for (const [, totals] of mealsByDate) {
        const withinRange = (actual: number, target: number) =>
          target === 0 || Math.abs(actual - target) / target <= 0.1;
        if (
          withinRange(totals.calories, targets.calories) &&
          withinRange(totals.protein, targets.protein)
        ) {
          hitDays++;
        }
      }
      publicProfile.macroHitRate = mealsByDate.size > 0 ? Math.round((hitDays / mealsByDate.size) * 100) : 0;
    }

    // full_transparency: add recent meals and workout completion
    if (visibility === "full_transparency") {
      publicProfile.recentMeals = meals
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
        .slice(0, 10)
        .map((m) => ({ date: m.date, name: m.name, macros: m.macros }));

      // Workout completion: % of planned workout days that had logged meals (proxy)
      if (plan?.workoutPlan?.weeklyPlan) {
        const plannedDays = plan.workoutPlan.weeklyPlan.length;
        const uniqueWeeks = new Set(meals.map((m) => {
          const d = new Date(m.date);
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          return weekStart.toISOString().slice(0, 10);
        }));
        // Simplified: ratio of active logging days to expected
        const totalExpected = uniqueWeeks.size * plannedDays;
        const totalLogged = mealDates.size;
        publicProfile.workoutCompletionRate = totalExpected > 0
          ? Math.min(100, Math.round((totalLogged / totalExpected) * 100))
          : 0;
      }
    }
  }

  return NextResponse.json(publicProfile);
}
