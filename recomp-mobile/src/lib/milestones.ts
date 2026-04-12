import type { MealEntry, FitnessPlan, Macros, Milestone } from "./types";

export const BADGE_INFO: Record<string, { name: string; desc: string; xp: number }> = {
  first_meal: { name: "First Bite", desc: "Logged your first meal", xp: 25 },
  meal_streak_3: { name: "3-Day Streak", desc: "Logged meals 3 days in a row", xp: 50 },
  meal_streak_7: { name: "Week Warrior", desc: "7-day meal logging streak", xp: 100 },
  meal_streak_14: { name: "Fortnight Fighter", desc: "14-day streak", xp: 200 },
  meal_streak_30: { name: "Monthly Master", desc: "30-day logging streak", xp: 500 },
  macro_hit_week: { name: "Macro Pro", desc: "Hit macro targets 5/7 days", xp: 75 },
  macro_hit_month: { name: "Macro Legend", desc: "Hit targets 20+ days in a month", xp: 250 },
  week_warrior: { name: "Consistency King", desc: "Logged meals 5+ days in a week", xp: 60 },
  plan_adjuster: { name: "Plan Adapter", desc: "Used AI to adjust your plan", xp: 40 },
  early_adopter: { name: "Early Adopter", desc: "Connected a wearable", xp: 50 },
  wearable_synced: { name: "Data Driven", desc: "Synced wearable data", xp: 30 },
};

function getDaysWithMeals(meals: MealEntry[]): Set<string> {
  const dates = new Set<string>();
  meals.forEach((m) => {
    if (m?.date && typeof m.date === "string") dates.add(m.date);
  });
  return dates;
}

function getLongestStreak(dates: Set<string>): number {
  if (dates.size === 0) return 0;
  const sorted = Array.from(dates).sort();
  let streak = 1;
  let max = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]).getTime();
    const curr = new Date(sorted[i]).getTime();
    if (curr - prev === 86400000) streak++;
    else streak = 1;
    max = Math.max(max, streak);
  }
  return max;
}

export function computeMilestones(
  meals: MealEntry[],
  plan: FitnessPlan | null,
  targets: Macros,
  wearableCount: number,
  hasAdjustedPlan: boolean
): { milestones: Milestone[]; xp: number; progress: Record<string, number> } {
  const milestones: Milestone[] = [];
  let xp = 0;
  const progress: Record<string, number> = {};
  const dates = getDaysWithMeals(meals);
  const longestStreak = getLongestStreak(dates);

  const today = new Date().toISOString().slice(0, 10);
  const sorted = Array.from(dates).sort().reverse();
  let currentStreak = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = new Date(d).getTime();
    if (d <= today && (prev === null || prev - t === 86400000)) currentStreak++;
    else break;
    prev = t;
  }

  if (dates.size >= 1) {
    milestones.push({ id: "first_meal", earnedAt: new Date().toISOString() });
    xp += BADGE_INFO.first_meal.xp;
  }
  for (const [threshold, id] of [
    [3, "meal_streak_3"],
    [7, "meal_streak_7"],
    [14, "meal_streak_14"],
    [30, "meal_streak_30"],
  ] as const) {
    progress[`streak_${threshold}`] = Math.min(100, (currentStreak / threshold) * 100);
    if (longestStreak >= threshold) {
      milestones.push({ id, earnedAt: new Date().toISOString() });
      xp += BADGE_INFO[id]?.xp ?? 0;
    }
  }

  const daysWithMacros = new Set<string>();
  const t = targets;
  meals.forEach((m) => {
    if (!m?.date || !m?.macros) return;
    const cal = Number(m.macros.calories);
    const pro = Number(m.macros.protein);
    if (!Number.isFinite(cal) || !Number.isFinite(pro)) return;
    const calOk = Math.abs(cal - t.calories) <= t.calories * 0.15;
    const proOk = pro >= t.protein * 0.9;
    if (calOk && proOk) daysWithMacros.add(m.date);
  });
  const macroRun = Array.from(daysWithMacros).filter((d) => d <= today).length;
  progress.macro_week = Math.min(100, (macroRun / 5) * 100);
  if (daysWithMacros.size >= 5) {
    milestones.push({ id: "macro_hit_week", earnedAt: new Date().toISOString() });
    xp += BADGE_INFO.macro_hit_week.xp;
  }
  if (daysWithMacros.size >= 20) {
    milestones.push({ id: "macro_hit_month", earnedAt: new Date().toISOString() });
    xp += BADGE_INFO.macro_hit_month.xp;
  }

  const byWeek = new Map<string, number>();
  dates.forEach((d) => {
    const dt = new Date(d);
    const weekStart = new Date(dt);
    weekStart.setDate(dt.getDate() - dt.getDay());
    const week = weekStart.toISOString().slice(0, 10);
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
  });
  const weeksWith5 = Array.from(byWeek.values()).filter((v) => v >= 5).length;
  progress.week_warrior = weeksWith5 >= 1 ? 100 : 0;
  if (weeksWith5 >= 1) {
    milestones.push({ id: "week_warrior", earnedAt: new Date().toISOString() });
    xp += BADGE_INFO.week_warrior.xp;
  }

  if (hasAdjustedPlan) {
    milestones.push({ id: "plan_adjuster", earnedAt: new Date().toISOString() });
    xp += BADGE_INFO.plan_adjuster.xp;
  }
  if (wearableCount >= 1) {
    milestones.push({ id: "early_adopter", earnedAt: new Date().toISOString() });
    xp += BADGE_INFO.early_adopter.xp;
  }
  if (wearableCount > 0) {
    milestones.push({ id: "wearable_synced", earnedAt: new Date().toISOString() });
    xp += BADGE_INFO.wearable_synced.xp;
  }

  return { milestones, xp, progress };
}

const BADGE_ICONS: Record<string, string> = {
  first_meal: "🍽️",
  meal_streak_3: "🔥",
  meal_streak_7: "⚡",
  meal_streak_14: "💪",
  meal_streak_30: "🏆",
  macro_hit_week: "🎯",
  macro_hit_month: "👑",
  week_warrior: "📅",
  plan_adjuster: "🔄",
  early_adopter: "⌚",
  wearable_synced: "📊",
};

export function getBadgeIcon(id: string): string {
  return BADGE_ICONS[id] ?? "🏅";
}
