import { create } from "zustand";
import type { FitnessPlan, MealEntry, ActivityLogEntry } from "../lib/types";
import * as storage from "../lib/storage";

interface AppState {
  plan: FitnessPlan | null;
  meals: MealEntry[];
  activityLog: ActivityLogEntry[];
  workoutProgress: Record<string, string>;
  selectedDate: string;
  setPlan: (plan: FitnessPlan | null) => Promise<void>;
  setMeals: (meals: MealEntry[]) => Promise<void>;
  addMeal: (meal: MealEntry) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  setActivityLog: (log: ActivityLogEntry[]) => Promise<void>;
  addActivity: (entry: ActivityLogEntry) => Promise<void>;
  removeActivity: (id: string) => Promise<void>;
  setWorkoutProgress: (progress: Record<string, string>) => Promise<void>;
  setSelectedDate: (date: string) => void;
  hydrate: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  plan: null,
  meals: [],
  activityLog: [],
  workoutProgress: {},
  selectedDate: new Date().toISOString().slice(0, 10),

  setPlan: async (plan) => {
    await storage.savePlan(plan);
    set({ plan });
  },

  setMeals: async (meals) => {
    await storage.saveMeals(meals);
    set({ meals });
  },

  addMeal: async (meal) => {
    const meals = [...get().meals, meal];
    await storage.saveMeals(meals);
    set({ meals });
  },

  deleteMeal: async (id) => {
    const meals = get().meals.filter((m) => m.id !== id);
    await storage.saveMeals(meals);
    set({ meals });
  },

  setActivityLog: async (log) => {
    await storage.saveActivityLog(log);
    set({ activityLog: log });
  },

  addActivity: async (entry) => {
    const log = [...get().activityLog, entry];
    await storage.saveActivityLog(log);
    set({ activityLog: log });
  },

  removeActivity: async (id) => {
    const log = get().activityLog.filter((a) => a.id !== id);
    await storage.saveActivityLog(log);
    set({ activityLog: log });
  },

  setWorkoutProgress: async (progress) => {
    await storage.saveWorkoutProgress(progress);
    set({ workoutProgress: progress });
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  hydrate: async () => {
    try {
      const { useAuthStore } = await import("./authStore");
      const { pullRemoteSnapshot } = await import("../lib/sync");
      if (useAuthStore.getState().userId) {
        await pullRemoteSnapshot();
      }
    } catch {
      /* offline or pull failed — still load local snapshot */
    }
    const [plan, meals, activityLog, workoutProgress] = await Promise.all([
      storage.getPlan(),
      storage.getMeals(),
      storage.getActivityLog(),
      storage.getWorkoutProgress(),
    ]);
    set({ plan, meals, activityLog, workoutProgress });
  },
}));
