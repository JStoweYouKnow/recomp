import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FitnessPlan, MealEntry, ActivityLogEntry, RicoMessage, WeeklyReview, WearableDaySummary, WearableConnection } from "./types";

const KEYS = {
  plan: "recomp_plan",
  meals: "recomp_meals",
  activityLog: "recomp_activity_log",
  workoutProgress: "recomp_workout_progress",
  ricoHistory: "recomp_rico_history",
  hasAdjustedPlan: "recomp_has_adjusted",
  weeklyReview: "recomp_weekly_review",
  wearableData: "recomp_wearable_data",
  wearableConnections: "recomp_wearable_connections",
  shoppingList: "recomp_shopping_list",
} as const;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getPlan(): Promise<FitnessPlan | null> {
  const raw = await AsyncStorage.getItem(KEYS.plan);
  return safeParse(raw, null);
}

export async function savePlan(plan: FitnessPlan | null): Promise<void> {
  if (plan) {
    await AsyncStorage.setItem(KEYS.plan, JSON.stringify(plan));
  } else {
    await AsyncStorage.removeItem(KEYS.plan);
  }
}

export async function getMeals(): Promise<MealEntry[]> {
  const raw = await AsyncStorage.getItem(KEYS.meals);
  const parsed = safeParse<MealEntry[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveMeals(meals: MealEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.meals, JSON.stringify(meals));
}

export async function getActivityLog(): Promise<ActivityLogEntry[]> {
  const raw = await AsyncStorage.getItem(KEYS.activityLog);
  const parsed = safeParse<ActivityLogEntry[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveActivityLog(log: ActivityLogEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.activityLog, JSON.stringify(log));
}

export async function getWorkoutProgress(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(KEYS.workoutProgress);
  const parsed = safeParse<Record<string, string>>(raw, {});
  return typeof parsed === "object" && parsed !== null ? parsed : {};
}

export async function saveWorkoutProgress(progress: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(KEYS.workoutProgress, JSON.stringify(progress));
}

export async function getRicoHistory(): Promise<RicoMessage[]> {
  const raw = await AsyncStorage.getItem(KEYS.ricoHistory);
  const parsed = safeParse<RicoMessage[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveRicoHistory(messages: RicoMessage[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.ricoHistory, JSON.stringify(messages));
}

export async function getHasAdjustedPlan(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEYS.hasAdjustedPlan);
  return v === "1";
}

export async function setHasAdjustedPlan(): Promise<void> {
  await AsyncStorage.setItem(KEYS.hasAdjustedPlan, "1");
}

export async function getWeeklyReview(): Promise<WeeklyReview | null> {
  const raw = await AsyncStorage.getItem(KEYS.weeklyReview);
  return safeParse(raw, null);
}

export async function saveWeeklyReview(review: WeeklyReview | null): Promise<void> {
  if (review) {
    await AsyncStorage.setItem(KEYS.weeklyReview, JSON.stringify(review));
  } else {
    await AsyncStorage.removeItem(KEYS.weeklyReview);
  }
}

export async function getWearableData(): Promise<WearableDaySummary[]> {
  const raw = await AsyncStorage.getItem(KEYS.wearableData);
  const parsed = safeParse<WearableDaySummary[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveWearableData(data: WearableDaySummary[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.wearableData, JSON.stringify(data));
}

export async function getWearableConnections(): Promise<WearableConnection[]> {
  const raw = await AsyncStorage.getItem(KEYS.wearableConnections);
  const parsed = safeParse<WearableConnection[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveWearableConnections(connections: WearableConnection[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.wearableConnections, JSON.stringify(connections));
}

export async function getShoppingList(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEYS.shoppingList);
  const parsed = safeParse<string[]>(raw, []);
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
}

export async function saveShoppingList(items: string[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.shoppingList, JSON.stringify(items));
}
