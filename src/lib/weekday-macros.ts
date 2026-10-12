import type { FitnessPlan, Macros, WorkoutDay } from "./types";
import { splitTrainingRestTargets } from "./macro-calculator";
import { matchDayToDate } from "./workout-schedule";

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const WEEKDAY_SHORT: Record<WeekdayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export type WeekdayMacroTargets = Partial<Record<WeekdayKey, Macros>>;

const JS_DAY_TO_KEY: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function getWeekdayKeyFromDate(date: string | Date): WeekdayKey {
  const d =
    typeof date === "string"
      ? new Date(date.includes("T") ? date : `${date}T12:00:00`)
      : date;
  return JS_DAY_TO_KEY[d.getDay()] ?? "mon";
}

export function dayLabelToWeekdayKey(dayLabel: string): WeekdayKey | null {
  const p = dayLabel.toLowerCase().trim();
  if (p.startsWith("mon")) return "mon";
  if (p.startsWith("tue")) return "tue";
  if (p.startsWith("wed")) return "wed";
  if (p.startsWith("thu")) return "thu";
  if (p.startsWith("fri")) return "fri";
  if (p.startsWith("sat")) return "sat";
  if (p.startsWith("sun")) return "sun";
  return null;
}

export function isRestWorkoutFocus(focus: string): boolean {
  const f = focus.toLowerCase();
  return f.includes("rest") || f.includes("recovery") || f.includes("off");
}

export function hasExplicitWeekdayTargets(
  weekdayTargets: WeekdayMacroTargets | undefined
): boolean {
  if (!weekdayTargets) return false;
  return WEEKDAY_KEYS.some((k) => (weekdayTargets[k]?.calories ?? 0) > 0);
}

function trainingRestPair(dietPlan: FitnessPlan["dietPlan"]): { training: Macros; rest: Macros } {
  const base = dietPlan.dailyTargets;
  const split = splitTrainingRestTargets(base);
  const training =
    dietPlan.trainingTargets && dietPlan.trainingTargets.calories > 0
      ? dietPlan.trainingTargets
      : split.trainingTargets;
  const rest =
    dietPlan.restTargets && dietPlan.restTargets.calories > 0
      ? dietPlan.restTargets
      : split.restTargets;
  return { training, rest };
}

/** Legacy training/rest/day-type resolution (mobile parity). */
export function legacyMacroTargetsForDate(plan: FitnessPlan, date: string): Macros {
  const fallback = plan.dietPlan.dailyTargets;
  const { training, rest } = trainingRestPair(plan.dietPlan);
  const idx = matchDayToDate(plan, date);
  if (idx != null) {
    const workout = plan.workoutPlan.weeklyPlan[idx];
    if (workout && isRestWorkoutFocus(workout.focus)) return rest;
    return training;
  }
  if (rest.calories > 0) return rest;
  return fallback.calories > 0 ? fallback : { calories: 2000, protein: 150, carbs: 200, fat: 65 };
}

/** Targets for a calendar date — weekday map when set, else legacy split. */
export function resolveMacroTargetsForDate(plan: FitnessPlan, date: string): Macros {
  const key = getWeekdayKeyFromDate(date);
  const weekday = plan.dietPlan.weekdayTargets?.[key];
  if (weekday && weekday.calories > 0) return weekday;
  return legacyMacroTargetsForDate(plan, date);
}

export function resolveMacroTargetsForToday(plan: FitnessPlan, today: string): Macros {
  return resolveMacroTargetsForDate(plan, today);
}

/** Build a full Mon–Sun map from explicit weekday targets or legacy split + workout schedule. */
export function effectiveWeekdayTargets(plan: FitnessPlan): Record<WeekdayKey, Macros> {
  const base = plan.dietPlan.dailyTargets;
  const { training, rest } = trainingRestPair(plan.dietPlan);
  const stored = plan.dietPlan.weekdayTargets;

  if (hasExplicitWeekdayTargets(stored)) {
    const out = {} as Record<WeekdayKey, Macros>;
    for (const key of WEEKDAY_KEYS) {
      out[key] = stored?.[key]?.calories ? stored[key]! : base;
    }
    return out;
  }

  const out = {} as Record<WeekdayKey, Macros>;
  for (const key of WEEKDAY_KEYS) {
    out[key] = rest;
  }

  const wp = plan.workoutPlan?.weeklyPlan ?? [];
  for (const day of wp) {
    const key = dayLabelToWeekdayKey(day.day);
    if (!key) continue;
    out[key] = isRestWorkoutFocus(day.focus) ? rest : training;
  }

  // Positional plans (Day 1 = Monday …)
  if (wp.length > 0 && !wp.some((d) => dayLabelToWeekdayKey(d.day))) {
    const order: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    for (let i = 0; i < Math.min(wp.length, order.length); i++) {
      const w = wp[i];
      out[order[i]] = isRestWorkoutFocus(w.focus) ? rest : training;
    }
  }

  return out;
}

/** Seed weekday targets when generating or recalculating a plan. */
export function seedWeekdayTargetsFromPlan(
  _dailyTargets: Macros,
  trainingTargets: Macros,
  restTargets: Macros,
  workoutDays: WorkoutDay[]
): Record<WeekdayKey, Macros> {
  const out = {} as Record<WeekdayKey, Macros>;
  for (const key of WEEKDAY_KEYS) {
    out[key] = restTargets;
  }
  for (const day of workoutDays) {
    const key = dayLabelToWeekdayKey(day.day);
    if (key) {
      out[key] = isRestWorkoutFocus(day.focus) ? restTargets : trainingTargets;
      continue;
    }
  }
  if (workoutDays.length > 0 && !workoutDays.some((d) => dayLabelToWeekdayKey(d.day))) {
    const order: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    for (let i = 0; i < Math.min(workoutDays.length, order.length); i++) {
      const w = workoutDays[i];
      out[order[i]] = isRestWorkoutFocus(w.focus) ? restTargets : trainingTargets;
    }
  }
  return out;
}

export function averageWeekdayTargets(targets: Record<WeekdayKey, Macros>): Macros {
  let cal = 0;
  let pro = 0;
  let carb = 0;
  let fat = 0;
  for (const key of WEEKDAY_KEYS) {
    const m = targets[key];
    cal += m.calories;
    pro += m.protein;
    carb += m.carbs;
    fat += m.fat;
  }
  const n = WEEKDAY_KEYS.length;
  return {
    calories: Math.round(cal / n),
    protein: Math.round(pro / n),
    carbs: Math.round(carb / n),
    fat: Math.round(fat / n),
  };
}
