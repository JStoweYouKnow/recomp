import type { UserProfile, MealEntry, FitnessPlan, WearableConnection, WearableDaySummary, Milestone, RicoMessage, WeeklyReview, CookingAppConnection, ActivityLogEntry } from "./types";

const STORAGE_KEYS = {
  profile: "recomp_profile",
  meals: "recomp_meals",
  plan: "recomp_plan",
  mealEmbeddings: "recomp_meal_embeddings",
  wearableConnections: "recomp_wearable_connections",
  wearableData: "recomp_wearable_data",
  milestones: "recomp_milestones",
  xp: "recomp_xp",
  ricoHistory: "recomp_rico_history",
  hasAdjustedPlan: "recomp_has_adjusted",
  weeklyReview: "recomp_weekly_review",
  workoutProgress: "recomp_workout_progress",
  cookingApps: "recomp_cooking_apps",
  activityLog: "recomp_activity_log",
} as const;

export function getProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem(STORAGE_KEYS.profile);
  return data ? JSON.parse(data) : null;
}

export function saveProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
}

export function getMeals(): MealEntry[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(STORAGE_KEYS.meals);
  return data ? JSON.parse(data) : [];
}

export function saveMeals(meals: MealEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.meals, JSON.stringify(meals));
}

export function getPlan(): FitnessPlan | null {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem(STORAGE_KEYS.plan);
  return data ? JSON.parse(data) : null;
}

export function savePlan(plan: FitnessPlan): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(plan));
}

export function getMealEmbeddings(): { mealId: string; embedding: number[] }[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(STORAGE_KEYS.mealEmbeddings);
  return data ? JSON.parse(data) : [];
}

export function saveMealEmbeddings(embeddings: { mealId: string; embedding: number[] }[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.mealEmbeddings, JSON.stringify(embeddings));
}

export function getWearableConnections(): WearableConnection[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(STORAGE_KEYS.wearableConnections);
  return data ? JSON.parse(data) : [];
}

export function saveWearableConnections(connections: WearableConnection[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.wearableConnections, JSON.stringify(connections));
}

export function getWearableData(): WearableDaySummary[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(STORAGE_KEYS.wearableData);
  return data ? JSON.parse(data) : [];
}

export function saveWearableData(data: WearableDaySummary[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.wearableData, JSON.stringify(data));
}

export function getMilestones(): Milestone[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(STORAGE_KEYS.milestones);
  return data ? JSON.parse(data) : [];
}

export function saveMilestones(milestones: Milestone[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.milestones, JSON.stringify(milestones));
}

export function getXP(): number {
  if (typeof window === "undefined") return 0;
  const data = localStorage.getItem(STORAGE_KEYS.xp);
  return data ? parseInt(data, 10) : 0;
}

export function saveXP(xp: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.xp, String(Math.max(0, xp)));
}

export function getRicoHistory(): RicoMessage[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(STORAGE_KEYS.ricoHistory);
  return data ? JSON.parse(data) : [];
}

export function saveRicoHistory(messages: RicoMessage[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.ricoHistory, JSON.stringify(messages.slice(-50)));
}

export function getHasAdjustedPlan(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEYS.hasAdjustedPlan) === "1";
}

export function setHasAdjustedPlan(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.hasAdjustedPlan, "1");
}

export function getWeeklyReview(): WeeklyReview | null {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem(STORAGE_KEYS.weeklyReview);
  return data ? JSON.parse(data) : null;
}

export function saveWeeklyReview(review: WeeklyReview): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.weeklyReview, JSON.stringify(review));
}

export type WorkoutProgressMap = Record<string, string>;

export function getWorkoutProgress(): WorkoutProgressMap {
  if (typeof window === "undefined") return {};
  const data = localStorage.getItem(STORAGE_KEYS.workoutProgress);
  return data ? JSON.parse(data) : {};
}

export function saveWorkoutProgress(progress: WorkoutProgressMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.workoutProgress, JSON.stringify(progress));
}

/* ── Activity Log ──────────────────────────────────────── */

export function getActivityLog(): ActivityLogEntry[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(STORAGE_KEYS.activityLog);
  return data ? JSON.parse(data) : [];
}

export function saveActivityLog(entries: ActivityLogEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.activityLog, JSON.stringify(entries));
}

export function getTodayActivityAdjustment(): number {
  const today = new Date().toISOString().slice(0, 10);
  const entries = getActivityLog().filter((e) => e.date === today);
  return entries.reduce((sum, e) => sum + e.calorieAdjustment, 0);
}

export function getDateActivityAdjustment(date: string): number {
  const entries = getActivityLog().filter((e) => e.date === date);
  return entries.reduce((sum, e) => sum + e.calorieAdjustment, 0);
}

/* ── Cooking App Connections ─────────────────────────────── */

export function getCookingAppConnections(): CookingAppConnection[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(STORAGE_KEYS.cookingApps);
  return data ? JSON.parse(data) : [];
}

export function saveCookingAppConnections(connections: CookingAppConnection[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.cookingApps, JSON.stringify(connections));
}

/** Persist current localStorage state to DynamoDB (fire-and-forget) */
export function syncToServer(): void {
  if (typeof window === "undefined") return;
  const plan = getPlan();
  const meals = getMeals();
  const milestones = getMilestones();
  const xp = getXP();
  const hasAdjusted = getHasAdjustedPlan();
  const ricoHistory = getRicoHistory();
  const wearableConnections = getWearableConnections();
  const wearableData = getWearableData();

  fetch("/api/data/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, meals, milestones, xp, hasAdjusted, ricoHistory, wearableConnections, wearableData }),
  }).catch(() => {});
}
