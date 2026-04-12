import { useAuthStore } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import { apiFetch } from "./api";
import { enqueue } from "./sync-queue";
import { captureError } from "./sentry";
import * as storage from "./storage";
import type { WearableDaySummary, WearableProvider } from "./types";

/** Ensure wearable entries have provider for sync schema (required by API). */
function normalizeWearableData(data: WearableDaySummary[]): Array<WearableDaySummary & { provider: WearableProvider }> {
  return data.map((d) => ({
    ...d,
    provider: (d.provider ?? (d.source === "oura" ? "oura" : d.source === "fitbit" ? "fitbit" : "scale")) as WearableProvider,
  }));
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
