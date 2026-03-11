import type { MealEntry, FitnessPlan, Macros, Milestone, HydrationEntry, FastingSession, BiofeedbackEntry, MetabolicModel, PantryItem, BodyScan, Supplement, BloodWork, Challenge, MusicPreference, CoachSchedule } from "./types";
import { getTodayLocal } from "./date-utils";

const BADGE_INFO: Record<string, { name: string; desc: string; xp: number }> = {
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
  // Hydration
  hydration_streak_3: { name: "Hydrated", desc: "Hit water target 3 days running", xp: 30 },
  hydration_streak_7: { name: "Water Warrior", desc: "7-day hydration streak", xp: 60 },
  // Fasting
  first_fast: { name: "Faster", desc: "Completed your first fast", xp: 25 },
  fasting_streak_7: { name: "Fasting Veteran", desc: "Completed 7 fasts", xp: 75 },
  // Biofeedback
  biofeedback_streak_7: { name: "Self-Aware", desc: "Logged biofeedback 7 days in a row", xp: 60 },
  // Metabolic
  metabolic_modeled: { name: "Metabolism Mapped", desc: "Built your personal metabolic model", xp: 75 },
  // Recovery
  recovery_listener: { name: "Recovery Listener", desc: "Adjusted a workout based on recovery", xp: 40 },
  // Pantry
  pantry_stocked: { name: "Stocked Up", desc: "Added 10+ pantry items", xp: 30 },
  // Meal Prep
  first_meal_prep: { name: "Prep Master", desc: "Generated your first meal prep plan", xp: 50 },
  // Restaurant
  menu_scanner: { name: "Menu Master", desc: "Scanned and logged from a restaurant menu", xp: 40 },
  // Coach
  coach_check_in_streak_7: { name: "Accountable", desc: "Responded to 7 consecutive check-ins", xp: 75 },
  // Challenges
  first_challenge_won: { name: "Champion", desc: "Won your first challenge", xp: 100 },
  challenge_creator: { name: "Challenge Maker", desc: "Created a challenge", xp: 30 },
  // Music
  music_connected: { name: "Workout DJ", desc: "Set up music for workouts", xp: 20 },
  // Supplements
  supplement_tracker: { name: "Supplement Savvy", desc: "Tracking 3+ supplements", xp: 30 },
  blood_work_uploaded: { name: "Data Driven Health", desc: "Uploaded blood work results", xp: 50 },
  // Duel
  duel_champion: { name: "Duel Champion", desc: "Won a head-to-head duel", xp: 150 },
  // Seasonal
  spring_sprinter: { name: "Spring Sprinter", desc: "Logged 20+ workouts in spring", xp: 200 },
  summer_shred: { name: "Summer Shred", desc: "Maintained a 30-day streak in summer", xp: 300 },
  harvest_gains: { name: "Harvest Gains", desc: "Hit macros 60+ days in fall", xp: 250 },
  winter_warrior: { name: "Winter Warrior", desc: "Maintained streak through the holidays", xp: 200 },
  // Hidden
  silent_assassin: { name: "Silent Assassin", desc: "Hit macros 30 days without checking milestones", xp: 300 },
  night_owl: { name: "Night Owl", desc: "Logged a meal between midnight and 4am", xp: 50 },
  perfectionist: { name: "Perfectionist", desc: "Hit exact calorie target (within 1%) for 7 days", xp: 200 },
  social_butterfly: { name: "Social Butterfly", desc: "Joined 3+ groups", xp: 75 },
  chatterbox: { name: "Chatterbox", desc: "Sent 50+ messages to Reco", xp: 100 },
};

export function getBadgeInfo() {
  return BADGE_INFO;
}

export const SEASONAL_BADGES = ["spring_sprinter", "summer_shred", "harvest_gains", "winter_warrior"] as const;
export const HIDDEN_BADGES = ["silent_assassin", "night_owl", "perfectionist", "social_butterfly", "chatterbox"] as const;

export function getCurrentSeason(): { id: string; name: string; badge: string; endMonth: number; endDay: number } {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return { id: "spring", name: "Spring", badge: "spring_sprinter", endMonth: 5, endDay: 31 };
  if (month >= 6 && month <= 8) return { id: "summer", name: "Summer", badge: "summer_shred", endMonth: 8, endDay: 31 };
  if (month >= 9 && month <= 11) return { id: "fall", name: "Fall", badge: "harvest_gains", endMonth: 11, endDay: 30 };
  return { id: "winter", name: "Winter", badge: "winter_warrior", endMonth: 2, endDay: 28 };
}

export function getSeasonDaysLeft(): number {
  const season = getCurrentSeason();
  const now = new Date();
  const year = season.endMonth < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
  const end = new Date(year, season.endMonth - 1, season.endDay);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

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

function getCurrentStreak(dates: Set<string>): number {
  const today = getTodayLocal();
  if (!dates.has(today)) return 0;
  const sorted = Array.from(dates).sort().reverse();
  let streak = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = new Date(d).getTime();
    if (prev === null || prev - t === 86400000) streak++;
    else break;
    prev = t;
  }
  return streak;
}

/** Extended context for computing new-feature milestones */
export interface MilestoneExtras {
  hydrationEntries?: HydrationEntry[];
  hydrationDailyTargetMl?: number;
  fastingSessions?: FastingSession[];
  biofeedbackEntries?: BiofeedbackEntry[];
  metabolicModel?: MetabolicModel | null;
  hasAdjustedRecovery?: boolean;
  pantryItems?: PantryItem[];
  hasMealPrep?: boolean;
  hasScannedMenu?: boolean;
  coachSchedule?: CoachSchedule | null;
  challenges?: Challenge[];
  musicPreference?: MusicPreference | null;
  bodyScans?: BodyScan[];
  supplements?: Supplement[];
  bloodWork?: BloodWork[];
}

export function computeMilestones(
  meals: MealEntry[],
  plan: FitnessPlan | null,
  targets: Macros,
  wearableCount: number,
  hasAdjustedPlan: boolean,
  earnedIds: Set<string>,
  extras?: MilestoneExtras
): { newMilestones: Milestone[]; xpGained: number; progress: Record<string, number> } {
  const newMilestones: Milestone[] = [];
  let xpGained = 0;
  const progress: Record<string, number> = {};
  const dates = getDaysWithMeals(meals);
  const longestStreak = getLongestStreak(dates);
  const currentStreak = getCurrentStreak(dates);

  function award(id: string) {
    if (earnedIds.has(id)) return;
    newMilestones.push({ id: id as Milestone["id"], earnedAt: new Date().toISOString() });
    xpGained += BADGE_INFO[id]?.xp ?? 0;
  }

  if (dates.size >= 1) award("first_meal");

  for (const [threshold, id] of [
    [3, "meal_streak_3"],
    [7, "meal_streak_7"],
    [14, "meal_streak_14"],
    [30, "meal_streak_30"],
  ] as const) {
    progress[`streak_${threshold}`] = Math.min(100, (currentStreak / threshold) * 100);
    if (longestStreak >= threshold) award(id);
  }

  const daysWithMacros = new Set<string>();
  meals.forEach((m) => {
    if (!m?.date || !m?.macros || typeof m.macros !== "object") return;
    const t = targets;
    const cal = Number(m.macros.calories);
    const pro = Number(m.macros.protein);
    if (!Number.isFinite(cal) || !Number.isFinite(pro)) return;
    const calOk = Math.abs(cal - t.calories) <= t.calories * 0.15;
    const proOk = pro >= t.protein * 0.9;
    if (calOk && proOk) daysWithMacros.add(m.date);
  });
  const macroStreak = Array.from(daysWithMacros).sort().reverse();
  let macroRun = 0;
  const today = getTodayLocal();
  for (const d of macroStreak) {
    if (d <= today) macroRun++;
    else break;
  }
  progress.macro_week = Math.min(100, (macroRun / 5) * 100);
  if (daysWithMacros.size >= 5) award("macro_hit_week");
  if (daysWithMacros.size >= 20) award("macro_hit_month");

  const byWeek = new Map<string, number>();
  dates.forEach((d) => {
    const dt = new Date(d);
    const weekStart = new Date(dt);
    weekStart.setDate(dt.getDate() - dt.getDay());
    const week = weekStart.toISOString().slice(0, 10);
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
  });
  const weekCounts = Array.from(byWeek.values());
  const weeksWith5 = weekCounts.filter((v) => v >= 5).length;
  const maxInWeek = weekCounts.length ? Math.max(...weekCounts) : 0;
  progress.week_warrior = weeksWith5 >= 1 ? 100 : Math.min(100, (maxInWeek / 5) * 100);
  if (weeksWith5 >= 1) award("week_warrior");

  if (hasAdjustedPlan) award("plan_adjuster");
  if (wearableCount >= 1) award("early_adopter");
  if (wearableCount > 0) award("wearable_synced");

  // ── New feature milestones ────────────────────────────
  if (extras) {
    // Hydration streaks
    if (extras.hydrationEntries && extras.hydrationDailyTargetMl) {
      const target = extras.hydrationDailyTargetMl;
      const dailyTotals = new Map<string, number>();
      extras.hydrationEntries.forEach((e) => {
        dailyTotals.set(e.date, (dailyTotals.get(e.date) ?? 0) + e.amountMl);
      });
      const hydDates = new Set<string>();
      dailyTotals.forEach((total, date) => {
        if (total >= target) hydDates.add(date);
      });
      const hydStreak = getCurrentStreak(hydDates);
      progress.hydration_streak_3 = Math.min(100, (hydStreak / 3) * 100);
      progress.hydration_streak_7 = Math.min(100, (hydStreak / 7) * 100);
      if (hydStreak >= 3) award("hydration_streak_3");
      if (hydStreak >= 7) award("hydration_streak_7");
    }

    // Fasting milestones
    if (extras.fastingSessions) {
      const completed = extras.fastingSessions.filter((s) => s.endTime);
      progress.first_fast = completed.length >= 1 ? 100 : 0;
      progress.fasting_streak_7 = Math.min(100, (completed.length / 7) * 100);
      if (completed.length >= 1) award("first_fast");
      if (completed.length >= 7) award("fasting_streak_7");
    }

    // Biofeedback streak
    if (extras.biofeedbackEntries) {
      const bfDates = new Set<string>();
      extras.biofeedbackEntries.forEach((e) => bfDates.add(e.date));
      const bfStreak = getCurrentStreak(bfDates);
      progress.biofeedback_streak_7 = Math.min(100, (bfStreak / 7) * 100);
      if (bfStreak >= 7) award("biofeedback_streak_7");
    }

    // Metabolic model
    if (extras.metabolicModel && extras.metabolicModel.confidence >= 50) {
      award("metabolic_modeled");
    }

    // Recovery
    if (extras.hasAdjustedRecovery) award("recovery_listener");

    // Pantry
    if (extras.pantryItems && extras.pantryItems.length >= 10) award("pantry_stocked");

    // Meal prep
    if (extras.hasMealPrep) award("first_meal_prep");

    // Menu scanner
    if (extras.hasScannedMenu) award("menu_scanner");

    // Coach check-in streak
    if (extras.coachSchedule) {
      const acks = extras.coachSchedule.confrontations.filter((c) => c.acknowledged).length;
      progress.coach_check_in_streak_7 = Math.min(100, (acks / 7) * 100);
      if (acks >= 7) award("coach_check_in_streak_7");
    }

    // Challenges
    if (extras.challenges) {
      const won = extras.challenges.filter(
        (c) => c.status === "completed" && c.participants.some((p) => p.score > 0)
      );
      if (won.length >= 1) award("first_challenge_won");
      const created = extras.challenges.filter((c) => c.createdBy !== "");
      if (created.length >= 1) award("challenge_creator");
    }

    // Music
    if (extras.musicPreference) award("music_connected");

    // Supplements
    if (extras.supplements && extras.supplements.length >= 3) award("supplement_tracker");
    if (extras.bloodWork && extras.bloodWork.length >= 1) award("blood_work_uploaded");

    // Duel champion
    if (extras.challenges) {
      const wonDuels = extras.challenges.filter(
        (c) => c.type === "duel" && c.status === "completed" && c.participants[0]?.score > (c.participants[1]?.score ?? 0)
      );
      if (wonDuels.length >= 1) award("duel_champion");
    }
  }

  // ── Seasonal badges ──
  const month = new Date().getMonth() + 1;
  // Spring Sprinter (March-May): 20+ workouts logged
  if (month >= 3 && month <= 5) {
    // approximate from meals frequency as workout proxy
    const springMeals = meals.filter((m) => {
      const mm = new Date(m.date).getMonth() + 1;
      return mm >= 3 && mm <= 5;
    });
    const springDays = new Set(springMeals.map((m) => m.date)).size;
    progress.spring_sprinter = Math.min(100, (springDays / 20) * 100);
    if (springDays >= 20) award("spring_sprinter");
  }
  // Summer Shred (June-Aug): 30-day streak
  if (month >= 6 && month <= 8) {
    progress.summer_shred = Math.min(100, (currentStreak / 30) * 100);
    if (longestStreak >= 30) award("summer_shred");
  }
  // Harvest Gains (Sept-Nov): hit macros 60+ days
  if (month >= 9 && month <= 11) {
    progress.harvest_gains = Math.min(100, (daysWithMacros.size / 60) * 100);
    if (daysWithMacros.size >= 60) award("harvest_gains");
  }
  // Winter Warrior (Dec-Feb): maintain streak through holidays
  if (month === 12 || month <= 2) {
    progress.winter_warrior = Math.min(100, (currentStreak / 14) * 100);
    if (currentStreak >= 14) award("winter_warrior");
  }

  // ── Hidden badges ──
  // night_owl: meal logged between midnight and 4am
  meals.forEach((m) => {
    if (m.loggedAt) {
      const loggedAt = new Date(m.loggedAt);
      const loggedDate = Number.isNaN(loggedAt.getTime())
        ? ""
        : `${loggedAt.getFullYear()}-${String(loggedAt.getMonth() + 1).padStart(2, "0")}-${String(
            loggedAt.getDate()
          ).padStart(2, "0")}`;
      const h = loggedAt.getHours();
      // Only count true late-night logging events for that same meal day.
      if (loggedDate === m.date && h >= 0 && h < 4) award("night_owl");
    }
  });

  // perfectionist: hit exact calorie target (within 1%) for 7 days
  const dailyCalTotals = new Map<string, number>();
  meals.forEach((m) => {
    if (!m?.date) return;
    const calories = typeof m.macros?.calories === "number" ? m.macros.calories : 0;
    dailyCalTotals.set(m.date, (dailyCalTotals.get(m.date) ?? 0) + calories);
  });
  let perfectDays = 0;
  dailyCalTotals.forEach((cal) => {
    if (Math.abs(cal - targets.calories) <= targets.calories * 0.01) perfectDays++;
  });
  if (perfectDays >= 7) award("perfectionist");

  return { newMilestones, xpGained, progress };
}

export function xpToLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function xpForNextLevel(xp: number): number {
  const lvl = xpToLevel(xp);
  return (lvl * lvl) * 100 - xp;
}
