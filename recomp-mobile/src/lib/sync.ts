import { useAuthStore } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import { apiFetch } from "./api";
import { enqueue } from "./sync-queue";
import { captureError } from "./sentry";
import * as storage from "./storage";
import type {
  ActivityLogEntry,
  FitnessPlan,
  MealEntry,
  RicoMessage,
  UserProfile,
  WearableConnection,
  WearableDaySummary,
  WearableProvider,
  WeeklyReview,
} from "./types";

/** Server GET /api/data/sync payload (subset used by mobile). */
type SyncPullPayload = {
  profile?: UserProfile;
  plan?: FitnessPlan | null;
  meals?: MealEntry[];
  wearableData?: WearableDaySummary[];
  wearableConnections?: WearableConnection[];
  weeklyReview?: WeeklyReview | null;
  activityLog?: ActivityLogEntry[];
  workoutProgress?: Record<string, string>;
  meta?: {
    xp?: number;
    hasAdjusted?: boolean;
    ricoHistory?: RicoMessage[];
  };
};

/** Ensure wearable entries have provider for sync schema (required by API). */
function normalizeWearableData(data: WearableDaySummary[]): Array<WearableDaySummary & { provider: WearableProvider }> {
  return data.map((d) => ({
    ...d,
    provider: (d.provider ?? (d.source === "oura" ? "oura" : d.source === "fitbit" ? "fitbit" : "scale")) as WearableProvider,
  }));
}

/**
 * Pull the latest account snapshot from the server (same GET as web after load).
 * Updates SecureStore profile, AsyncStorage plan/meals/activity/progress, and Zustand.
 * Call this before `syncToServer` so a stale local plan does not overwrite web edits.
 */
export async function pullRemoteSnapshot(): Promise<boolean> {
  const userId = useAuthStore.getState().userId;
  if (!userId) return false;

  try {
    const res = await apiFetch("/api/data/sync", { method: "GET" });
    if (!res.ok) return false;
    const data = (await res.json()) as SyncPullPayload & { error?: string };
    if (data.error || !data.profile) return false;

    await useAuthStore.getState().setProfile(data.profile);

    if (data.plan) {
      await useAppStore.getState().setPlan(data.plan);
    }
    if (Array.isArray(data.meals)) {
      await useAppStore.getState().setMeals(data.meals);
    }
    if (Array.isArray(data.activityLog)) {
      await useAppStore.getState().setActivityLog(data.activityLog);
    }
    if (data.workoutProgress && typeof data.workoutProgress === "object") {
      await useAppStore.getState().setWorkoutProgress(data.workoutProgress);
    }
    if (data.wearableData && data.wearableData.length > 0) {
      await storage.saveWearableData(normalizeWearableData(data.wearableData));
    }
    if (data.wearableConnections && data.wearableConnections.length > 0) {
      await storage.saveWearableConnections(data.wearableConnections);
    }
    if (data.weeklyReview !== undefined) {
      await storage.saveWeeklyReview(data.weeklyReview ?? null);
    }
    if (data.meta?.ricoHistory) {
      await storage.saveRicoHistory(data.meta.ricoHistory);
    }
    if (data.meta?.hasAdjusted) {
      await storage.setHasAdjustedPlan();
    }
    return true;
  } catch (e) {
    captureError(e as Error, { context: "pullRemoteSnapshot" });
    return false;
  }
}

/** Pull server state, then push local merge (matches web home load behavior). */
export async function syncBidirectional(): Promise<boolean> {
  await pullRemoteSnapshot();
  return syncToServer();
}

export async function syncToServer(): Promise<boolean> {
  const userId = useAuthStore.getState().userId;
  if (!userId) return false;

  const { plan, meals } = useAppStore.getState();
  const [ricoHistory, hasAdjusted, wearableData, wearableConnections] = await Promise.all([
    storage.getRicoHistory(),
    storage.getHasAdjustedPlan(),
    storage.getWearableData(),
    storage.getWearableConnections(),
  ]);

  const body = {
    plan,
    meals,
    milestones: [] as { id: string; earnedAt: string; progress?: number }[],
    xp: 0,
    hasAdjusted,
    ricoHistory,
    wearableConnections: Array.isArray(wearableConnections) ? wearableConnections : [],
    wearableData: normalizeWearableData(wearableData),
  };

  try {
    const res = await apiFetch("/api/data/sync", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    // Network failure — queue for retry when back online
    await enqueue("/api/data/sync", "POST", body).catch((e) =>
      captureError(e, { context: "sync_enqueue" })
    );
    return false;
  }
}
