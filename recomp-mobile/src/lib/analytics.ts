import AsyncStorage from "@react-native-async-storage/async-storage";
import { ENVIRONMENT } from "./config";

const EVENTS_KEY = "recomp_analytics_events";
const MAX_BATCH_SIZE = 50;

interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: string;
}

let _userId: string | null = null;

/** Set user identity for analytics. */
export function identify(userId: string | null) {
  _userId = userId;
}

/** Track an event. Events are batched locally and can be flushed to any analytics provider. */
export async function track(name: string, properties?: Record<string, string | number | boolean>) {
  if (ENVIRONMENT === "development" && __DEV__) {
    console.log(`[Analytics] ${name}`, properties ?? "");
  }

  const event: AnalyticsEvent = {
    name,
    properties: {
      ...properties,
      userId: _userId ?? "anonymous",
      environment: ENVIRONMENT,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    const raw = await AsyncStorage.getItem(EVENTS_KEY);
    const events: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    events.push(event);

    // Keep only the most recent events to prevent unbounded growth
    const trimmed = events.length > MAX_BATCH_SIZE * 2
      ? events.slice(-MAX_BATCH_SIZE)
      : events;

    await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
  } catch {
    // Silently fail — analytics should never break the app
  }
}

/** Flush stored events. Returns them and clears storage. */
export async function flushEvents(): Promise<AnalyticsEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    await AsyncStorage.removeItem(EVENTS_KEY);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Pre-defined event names ──────────────────────────────────────────

export const Events = {
  // Onboarding
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_COMPLETED: "onboarding_completed",
  PLAN_GENERATED: "plan_generated",

  // Meals
  MEAL_LOGGED: "meal_logged",
  MEAL_LOGGED_VOICE: "meal_logged_voice",
  MEAL_LOGGED_PHOTO: "meal_logged_photo",
  MEAL_LOGGED_RECEIPT: "meal_logged_receipt",
  MEAL_DELETED: "meal_deleted",
  MEAL_SUGGESTED: "meal_suggested",

  // Workouts
  WORKOUT_VIEWED: "workout_viewed",
  EXERCISE_COMPLETED: "exercise_completed",

  // AI
  RICO_CHAT_SENT: "rico_chat_sent",
  RICO_VOICE_USED: "rico_voice_used",
  WEEKLY_REVIEW_GENERATED: "weekly_review_generated",
  PLAN_ADJUSTED: "plan_adjusted",
  TRANSFORMATION_GENERATED: "transformation_generated",

  // Shopping
  SHOPPING_LIST_GENERATED: "shopping_list_generated",
  AMAZON_SEARCH_TRIGGERED: "amazon_search_triggered",

  // Wearables
  WEARABLE_CONNECTED: "wearable_connected",
  WEARABLE_DATA_SYNCED: "wearable_data_synced",

  // Navigation
  TAB_SWITCHED: "tab_switched",
  SCREEN_VIEWED: "screen_viewed",

  // Errors
  API_ERROR: "api_error",
  SYNC_FAILED: "sync_failed",
} as const;
