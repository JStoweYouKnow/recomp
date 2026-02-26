import type { UserProfile, MealEntry, FitnessPlan, Macros, WearableConnection, WearableDaySummary, Milestone, RicoMessage, WeeklyReview, CookingAppConnection, ActivityLogEntry, CookingAppRecipe } from "./types";
import { getTodayLocal } from "./date-utils";

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
  shoppingList: "recomp_shopping_list",
  cookingAppRecipes: "recomp_cooking_app_recipes",
  recentMealTemplates: "recomp_recent_meal_templates",
  recentExerciseNames: "recomp_recent_exercise_names",
} as const;

function safeParse<T>(data: string | null, fallback: T): T {
  if (data == null || data === "") return fallback;
  try {
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

export function getProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(STORAGE_KEYS.profile), null);
}

export function saveProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
}

export function getMeals(): MealEntry[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<MealEntry[]>(localStorage.getItem(STORAGE_KEYS.meals), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveMeals(meals: MealEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.meals, JSON.stringify(meals));
}

export function getPlan(): FitnessPlan | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(STORAGE_KEYS.plan), null);
}

export function savePlan(plan: FitnessPlan): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(plan));
}

export function getMealEmbeddings(): { mealId: string; embedding: number[] }[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<{ mealId: string; embedding: number[] }[]>(localStorage.getItem(STORAGE_KEYS.mealEmbeddings), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveMealEmbeddings(embeddings: { mealId: string; embedding: number[] }[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.mealEmbeddings, JSON.stringify(embeddings));
}

export function getWearableConnections(): WearableConnection[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<WearableConnection[]>(localStorage.getItem(STORAGE_KEYS.wearableConnections), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveWearableConnections(connections: WearableConnection[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.wearableConnections, JSON.stringify(connections));
}

export function getWearableData(): WearableDaySummary[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<WearableDaySummary[]>(localStorage.getItem(STORAGE_KEYS.wearableData), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveWearableData(data: WearableDaySummary[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.wearableData, JSON.stringify(data));
}

export function getMilestones(): Milestone[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<Milestone[]>(localStorage.getItem(STORAGE_KEYS.milestones), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveMilestones(milestones: Milestone[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.milestones, JSON.stringify(milestones));
}

export function getXP(): number {
  if (typeof window === "undefined") return 0;
  const data = localStorage.getItem(STORAGE_KEYS.xp);
  if (data == null || data === "") return 0;
  const n = parseInt(data, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function saveXP(xp: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.xp, String(Math.max(0, xp)));
}

export function getRicoHistory(): RicoMessage[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<RicoMessage[]>(localStorage.getItem(STORAGE_KEYS.ricoHistory), []);
  return Array.isArray(parsed) ? parsed : [];
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
  return safeParse(localStorage.getItem(STORAGE_KEYS.weeklyReview), null);
}

export function saveWeeklyReview(review: WeeklyReview): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.weeklyReview, JSON.stringify(review));
}

export type WorkoutProgressMap = Record<string, string>;

export function getWorkoutProgress(): WorkoutProgressMap {
  if (typeof window === "undefined") return {};
  const parsed = safeParse<WorkoutProgressMap>(localStorage.getItem(STORAGE_KEYS.workoutProgress), {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

export function saveWorkoutProgress(progress: WorkoutProgressMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.workoutProgress, JSON.stringify(progress));
}

/* ── Activity Log ──────────────────────────────────────── */

export function getActivityLog(): ActivityLogEntry[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<ActivityLogEntry[]>(localStorage.getItem(STORAGE_KEYS.activityLog), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveActivityLog(entries: ActivityLogEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.activityLog, JSON.stringify(entries));
}

export function getTodayActivityAdjustment(): number {
  const today = getTodayLocal();
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
  const parsed = safeParse<CookingAppConnection[]>(localStorage.getItem(STORAGE_KEYS.cookingApps), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveCookingAppConnections(connections: CookingAppConnection[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.cookingApps, JSON.stringify(connections));
}

/* ── Cooking app recipe library (for gourmet meal suggestions) ───────────── */

export function getCookingAppRecipes(): CookingAppRecipe[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<CookingAppRecipe[]>(localStorage.getItem(STORAGE_KEYS.cookingAppRecipes), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveCookingAppRecipes(recipes: CookingAppRecipe[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.cookingAppRecipes, JSON.stringify(recipes));
}

/* ── Recent meal templates (quick-fill when logging) ───────── */

export interface RecentMealTemplate {
  name: string;
  macros: Macros;
  lastUsed: string;
}

const MAX_RECENT_MEALS = 30;

export function getRecentMealTemplates(): RecentMealTemplate[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<RecentMealTemplate[]>(localStorage.getItem(STORAGE_KEYS.recentMealTemplates), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveRecentMealTemplate(meal: { name: string; macros: Macros }): void {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  const key = meal.name.toLowerCase().trim();
  const existing = getRecentMealTemplates();
  const filtered = existing.filter((t) => t.name.toLowerCase().trim() !== key);
  const updated = [...filtered, { ...meal, lastUsed: now }]
    .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, MAX_RECENT_MEALS);
  localStorage.setItem(STORAGE_KEYS.recentMealTemplates, JSON.stringify(updated));
}

/* ── Recent exercise names (autocomplete in workout editor) ── */

const MAX_RECENT_EXERCISES = 50;

export function getRecentExerciseNames(): string[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<string[]>(localStorage.getItem(STORAGE_KEYS.recentExerciseNames), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveRecentExerciseNames(names: string[]): void {
  if (typeof window === "undefined") return;
  const seen = new Set<string>();
  const deduped = names
    .map((n) => n.trim())
    .filter((n) => {
      if (!n || seen.has(n.toLowerCase())) return false;
      seen.add(n.toLowerCase());
      return true;
    })
    .slice(0, MAX_RECENT_EXERCISES);
  localStorage.setItem(STORAGE_KEYS.recentExerciseNames, JSON.stringify(deduped));
}

/* ── Shopping list (Nova Act grocery) ───────────────────── */

export function getShoppingList(): string[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<string[]>(localStorage.getItem(STORAGE_KEYS.shoppingList), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveShoppingList(items: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.shoppingList, JSON.stringify(items));
}

let _syncTimeout: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 800;

function doSync(): void {
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

/** Persist current localStorage state to DynamoDB (fire-and-forget). Debounced so rapid changes result in a single sync. */
export function syncToServer(): void {
  if (typeof window === "undefined") return;
  if (_syncTimeout) clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(() => {
    _syncTimeout = null;
    doSync();
  }, SYNC_DEBOUNCE_MS);
}

/** Flush any pending sync immediately (e.g. before page unload). Call from beforeunload/visibilitychange. */
export function flushSync(): void {
  if (typeof window === "undefined") return;
  if (_syncTimeout) {
    clearTimeout(_syncTimeout);
    _syncTimeout = null;
  }
  doSync();
}
