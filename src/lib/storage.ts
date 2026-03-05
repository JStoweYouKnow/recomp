import type { UserProfile, MeasurementTargets, MealEntry, FitnessPlan, Macros, WearableConnection, WearableDaySummary, Milestone, RicoMessage, WeeklyReview, CookingAppConnection, ActivityLogEntry, CookingAppRecipe, SocialSettings, GroupMembership, Group, GroupMessage, HydrationEntry, FastingSession, BiofeedbackEntry, MetabolicModel, RecoveryAssessment, PantryItem, MealPrepPlan, SavedRestaurantMeal, CoachSchedule, Challenge, MusicPreference, BodyScan, Supplement, BloodWork } from "./types";
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
  nutritionCache: "recomp_nutrition_cache",
  socialSettings: "recomp_social_settings",
  myGroups: "recomp_my_groups",
  groupCache: "recomp_group_cache",
  groupMessagesCache: "recomp_group_messages",
  measurementTargets: "recomp_measurement_targets",
  hydration: "recomp_hydration",
  fastingSessions: "recomp_fasting",
  biofeedback: "recomp_biofeedback",
  metabolicModel: "recomp_metabolic_model",
  recoveryAssessment: "recomp_recovery",
  pantry: "recomp_pantry",
  mealPrepPlan: "recomp_meal_prep",
  savedRestaurantMeals: "recomp_restaurant_meals",
  coachSchedule: "recomp_coach_schedule",
  challenges: "recomp_challenges",
  musicPreference: "recomp_music",
  bodyScans: "recomp_body_scans",
  supplements: "recomp_supplements",
  bloodWork: "recomp_blood_work",
  theme: "recomp_theme",
  soundsEnabled: "recomp_sounds_enabled",
  coachPersona: "recomp_coach_persona",
  dailyQuests: "recomp_daily_quests",
  hiddenBadgeTracking: "recomp_hidden_badge_tracking",
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

export function getMeasurementTargets(): MeasurementTargets | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEYS.measurementTargets);
  if (raw == null || raw === "") return null;
  const parsed = safeParse<MeasurementTargets>(raw, {});
  return Object.keys(parsed).length ? parsed : null;
}

export function saveMeasurementTargets(targets: MeasurementTargets): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.measurementTargets, JSON.stringify(targets));
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

/* ── Social Settings ──────────────────────────────────── */

export function getSocialSettings(): SocialSettings | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(STORAGE_KEYS.socialSettings), null);
}

export function saveSocialSettings(settings: SocialSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.socialSettings, JSON.stringify(settings));
}

/* ── Groups (read-cache, server-authoritative) ───────── */

export function getMyGroups(): GroupMembership[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<GroupMembership[]>(localStorage.getItem(STORAGE_KEYS.myGroups), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveMyGroups(groups: GroupMembership[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.myGroups, JSON.stringify(groups));
}

export function getCachedGroup(groupId: string): Group | null {
  if (typeof window === "undefined") return null;
  const map = safeParse<Record<string, Group>>(localStorage.getItem(STORAGE_KEYS.groupCache), {});
  return map[groupId] ?? null;
}

export function saveCachedGroup(group: Group): void {
  if (typeof window === "undefined") return;
  const map = safeParse<Record<string, Group>>(localStorage.getItem(STORAGE_KEYS.groupCache), {});
  map[group.id] = group;
  localStorage.setItem(STORAGE_KEYS.groupCache, JSON.stringify(map));
}

export function getCachedGroupMessages(groupId: string): GroupMessage[] {
  if (typeof window === "undefined") return [];
  const map = safeParse<Record<string, GroupMessage[]>>(localStorage.getItem(STORAGE_KEYS.groupMessagesCache), {});
  return map[groupId] ?? [];
}

export function saveCachedGroupMessages(groupId: string, messages: GroupMessage[]): void {
  if (typeof window === "undefined") return;
  const map = safeParse<Record<string, GroupMessage[]>>(localStorage.getItem(STORAGE_KEYS.groupMessagesCache), {});
  map[groupId] = messages.slice(-100);
  localStorage.setItem(STORAGE_KEYS.groupMessagesCache, JSON.stringify(map));
}

/* ── Hydration Tracking ───────────────────────────────── */

export function getHydration(): HydrationEntry[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<HydrationEntry[]>(localStorage.getItem(STORAGE_KEYS.hydration), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveHydration(entries: HydrationEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.hydration, JSON.stringify(entries));
}

/* ── Fasting Timer ────────────────────────────────────── */

export function getFastingSessions(): FastingSession[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<FastingSession[]>(localStorage.getItem(STORAGE_KEYS.fastingSessions), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveFastingSessions(sessions: FastingSession[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.fastingSessions, JSON.stringify(sessions));
}

export function getActiveFastingSession(): FastingSession | null {
  const sessions = getFastingSessions();
  return sessions.find((s) => !s.endTime) ?? null;
}

/* ── Biofeedback Journal ──────────────────────────────── */

export function getBiofeedback(): BiofeedbackEntry[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<BiofeedbackEntry[]>(localStorage.getItem(STORAGE_KEYS.biofeedback), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveBiofeedback(entries: BiofeedbackEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.biofeedback, JSON.stringify(entries));
}

/* ── Adaptive Metabolic Model ─────────────────────────── */

export function getMetabolicModel(): MetabolicModel | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(STORAGE_KEYS.metabolicModel), null);
}

export function saveMetabolicModel(model: MetabolicModel): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.metabolicModel, JSON.stringify(model));
}

/* ── Recovery Assessment ──────────────────────────────── */

export function getRecoveryAssessment(): RecoveryAssessment | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(STORAGE_KEYS.recoveryAssessment), null);
}

export function saveRecoveryAssessment(assessment: RecoveryAssessment): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.recoveryAssessment, JSON.stringify(assessment));
}

/* ── Pantry ───────────────────────────────────────────── */

export function getPantry(): PantryItem[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<PantryItem[]>(localStorage.getItem(STORAGE_KEYS.pantry), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function savePantry(items: PantryItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.pantry, JSON.stringify(items));
}

/* ── Meal Prep Planning ───────────────────────────────── */

export function getMealPrepPlan(): MealPrepPlan | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(STORAGE_KEYS.mealPrepPlan), null);
}

export function saveMealPrepPlan(plan: MealPrepPlan): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.mealPrepPlan, JSON.stringify(plan));
}

/* ── Saved Restaurant Meals ───────────────────────────── */

export function getSavedRestaurantMeals(): SavedRestaurantMeal[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<SavedRestaurantMeal[]>(localStorage.getItem(STORAGE_KEYS.savedRestaurantMeals), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveSavedRestaurantMeals(meals: SavedRestaurantMeal[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.savedRestaurantMeals, JSON.stringify(meals));
}

/* ── Coach Schedule ───────────────────────────────────── */

export function getCoachSchedule(): CoachSchedule | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(STORAGE_KEYS.coachSchedule), null);
}

export function saveCoachSchedule(schedule: CoachSchedule): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.coachSchedule, JSON.stringify(schedule));
}

/* ── Challenges ───────────────────────────────────────── */

export function getChallenges(): Challenge[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<Challenge[]>(localStorage.getItem(STORAGE_KEYS.challenges), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveChallenges(challenges: Challenge[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.challenges, JSON.stringify(challenges));
}

/* ── Music Preference ─────────────────────────────────── */

export function getMusicPreference(): MusicPreference | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(STORAGE_KEYS.musicPreference), null);
}

export function saveMusicPreference(pref: MusicPreference): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.musicPreference, JSON.stringify(pref));
}

/* ── Body Scans ───────────────────────────────────────── */

export function getBodyScans(): BodyScan[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<BodyScan[]>(localStorage.getItem(STORAGE_KEYS.bodyScans), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveBodyScans(scans: BodyScan[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.bodyScans, JSON.stringify(scans));
}

/* ── Supplements ──────────────────────────────────────── */

export function getSupplements(): Supplement[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<Supplement[]>(localStorage.getItem(STORAGE_KEYS.supplements), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveSupplements(supplements: Supplement[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.supplements, JSON.stringify(supplements));
}

/* ── Blood Work ───────────────────────────────────────── */

export function getBloodWork(): BloodWork[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<BloodWork[]>(localStorage.getItem(STORAGE_KEYS.bloodWork), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveBloodWork(entries: BloodWork[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.bloodWork, JSON.stringify(entries));
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
  const hydration = getHydration();
  const fastingSessions = getFastingSessions();
  const biofeedback = getBiofeedback();
  const pantry = getPantry();
  const bodyScans = getBodyScans();
  const supplements = getSupplements();
  const bloodWork = getBloodWork();

  fetch("/api/data/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan, meals, milestones, xp, hasAdjusted, ricoHistory,
      wearableConnections, wearableData,
      hydration, fastingSessions, biofeedback, pantry,
      bodyScans, supplements, bloodWork,
    }),
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

// ── Client-side nutrition cache ─────────────────────────────────────────
interface NutritionCacheItem {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  cachedAt: number; // epoch ms
}

type NutritionCacheMap = Record<string, NutritionCacheItem>;

const NUTRITION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function normalizeFood(food: string): string {
  return food.toLowerCase().trim().replace(/\s+/g, " ");
}

export function getNutritionCache(food: string): NutritionCacheItem | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEYS.nutritionCache);
  const map: NutritionCacheMap = raw ? safeParse(raw, {}) : {};
  const key = normalizeFood(food);
  const entry = map[key];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > NUTRITION_CACHE_TTL_MS) return null;
  return entry;
}

export function saveNutritionCache(food: string, item: Omit<NutritionCacheItem, "cachedAt">): void {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(STORAGE_KEYS.nutritionCache);
  const map: NutritionCacheMap = raw ? safeParse(raw, {}) : {};
  const key = normalizeFood(food);
  map[key] = { ...item, cachedAt: Date.now() };
  // Evict expired entries if map grows beyond 500
  const keys = Object.keys(map);
  if (keys.length > 500) {
    const now = Date.now();
    for (const k of keys) {
      if (now - map[k].cachedAt > NUTRITION_CACHE_TTL_MS) delete map[k];
    }
  }
  localStorage.setItem(STORAGE_KEYS.nutritionCache, JSON.stringify(map));
}

// ── Theme ──
export type ThemeMode = "light" | "dark";
export function getTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode) || "light";
}
export function saveTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
}

// ── Coach Persona ──
export type CoachPersona = "default" | "motivator" | "scientist" | "tough_love" | "chill_friend";
export function getCoachPersona(): CoachPersona {
  if (typeof window === "undefined") return "default";
  return (localStorage.getItem(STORAGE_KEYS.coachPersona) as CoachPersona) || "default";
}
export function saveCoachPersona(persona: CoachPersona): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.coachPersona, persona);
}

// ── Hidden Badge Tracking ──
export interface HiddenBadgeTracking {
  milestonesVisitCount: number;
  lastMilestonesVisit: string;
  ricoMessageCount: number;
}
export function getHiddenBadgeTracking(): HiddenBadgeTracking {
  if (typeof window === "undefined") return { milestonesVisitCount: 0, lastMilestonesVisit: "", ricoMessageCount: 0 };
  return safeParse(localStorage.getItem(STORAGE_KEYS.hiddenBadgeTracking), { milestonesVisitCount: 0, lastMilestonesVisit: "", ricoMessageCount: 0 });
}
export function saveHiddenBadgeTracking(tracking: HiddenBadgeTracking): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.hiddenBadgeTracking, JSON.stringify(tracking));
}
