import type { FitnessPlan, MealEntry, WorkoutExercise } from "./types";
import type { RegeneratePlanOptions } from "./multi-week-plan";
import { parseRegeneratePlanPayload } from "./multi-week-plan";
import { getTodayLocal, getWeekStart, parseClientDateString } from "./date-utils";
import { getMeals, getPlan, saveMeals, savePlan, syncToServer } from "./storage";

export type RicoActionWire = { type: string; payload: Record<string, unknown> };

export type RicoSkippedAction = { type: string; reason: string };

export type RicoApplyResult = {
  changed: boolean;
  touchedMeals: boolean;
  touchedPlan: boolean;
  regeneratePlan: boolean;
  regeneratePlanOptions?: RegeneratePlanOptions;
  applied: string[];
  skipped: RicoSkippedAction[];
};

export type RicoMutableState = {
  meals: MealEntry[];
  plan: FitnessPlan | null;
};

export type ApplyRicoOptions = {
  /** Client-local calendar day (YYYY-MM-DD) for new log_meal entries */
  defaultDate?: string;
};

const MEAL_TYPES = new Set<MealEntry["mealType"]>(["breakfast", "lunch", "dinner", "snack"]);

function parseMealType(value: unknown): MealEntry["mealType"] {
  const s = typeof value === "string" ? value.toLowerCase() : "";
  return MEAL_TYPES.has(s as MealEntry["mealType"]) ? (s as MealEntry["mealType"]) : "snack";
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : Math.max(0, parseInt(String(v ?? 0), 10) || 0);
}

function findDayIndex(plan: FitnessPlan, day: string): number {
  return plan.workoutPlan.weeklyPlan.findIndex((d) => d.day.toLowerCase() === day.toLowerCase());
}

/** Pure apply — mutates `state` in place; safe for web localStorage and server DB snapshots. */
export function applyRicoActionsToState(
  actions: RicoActionWire[],
  state: RicoMutableState,
  opts?: ApplyRicoOptions,
): RicoApplyResult {
  let changed = false;
  let touchedMeals = false;
  let touchedPlan = false;
  let regeneratePlan = false;
  let regeneratePlanOptions: RegeneratePlanOptions | undefined;
  const applied: string[] = [];
  const skipped: RicoSkippedAction[] = [];

  for (const act of actions) {
    switch (act.type) {
      case "update_macros": {
        const plan = state.plan;
        if (!plan) {
          skipped.push({ type: act.type, reason: "no plan" });
          break;
        }
        const p = act.payload;
        plan.dietPlan.dailyTargets = {
          calories: num(p.calories),
          protein: num(p.protein),
          carbs: num(p.carbs),
          fat: num(p.fat),
        };
        changed = true;
        touchedPlan = true;
        applied.push("update_macros");
        break;
      }
      case "log_meal": {
        const p = act.payload;
        const existingId = typeof p.id === "string" && p.id.trim() ? p.id.trim() : undefined;
        const id =
          existingId ??
          crypto.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const date =
          (existingId ? parseClientDateString(p.date) : undefined) ??
          opts?.defaultDate ??
          parseClientDateString(p.date) ??
          getTodayLocal();
        const meal: MealEntry = {
          id,
          date,
          name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Meal",
          mealType: parseMealType(p.mealType),
          loggedAt: new Date().toISOString(),
          macros: {
            calories: num(p.calories),
            protein: num(p.protein),
            carbs: num(p.carbs),
            fat: num(p.fat),
          },
        };
        const dupIdx = state.meals.findIndex((m) => m.id === id && m.date === date);
        if (dupIdx >= 0) {
          state.meals[dupIdx] = meal;
        } else {
          state.meals.push(meal);
        }
        // Echo ids back on the action payload so mobile clients insert the same row the server saved.
        p.id = id;
        p.date = date;
        changed = true;
        touchedMeals = true;
        applied.push("log_meal");
        break;
      }
      case "swap_exercise": {
        const plan = state.plan;
        const p = act.payload;
        const day = typeof p.day === "string" ? p.day : "";
        const oldExerciseName = typeof p.oldExerciseName === "string" ? p.oldExerciseName : "";
        const newExerciseName = typeof p.newExerciseName === "string" ? p.newExerciseName : "";
        if (!plan || !day || !oldExerciseName || !newExerciseName) {
          skipped.push({ type: act.type, reason: "missing plan, day, or exercise names" });
          break;
        }
        const dayIndex = findDayIndex(plan, day);
        if (dayIndex < 0) {
          skipped.push({ type: act.type, reason: `day not found: ${day}` });
          break;
        }
        const dayObj = plan.workoutPlan.weeklyPlan[dayIndex];
        const section =
          p.section === "warmups" || p.section === "finishers" ? p.section : "exercises";
        const list: WorkoutExercise[] =
          (section === "warmups" ? dayObj.warmups : section === "finishers" ? dayObj.finishers : dayObj.exercises) ??
          [];
        const idx = list.findIndex((ex) => ex.name.toLowerCase() === oldExerciseName.toLowerCase());
        if (idx < 0) {
          skipped.push({ type: act.type, reason: `exercise not found: ${oldExerciseName}` });
          break;
        }
        list[idx] = {
          name: newExerciseName,
          sets: typeof p.newSets === "string" ? p.newSets : list[idx].sets,
          reps: typeof p.newReps === "string" ? p.newReps : list[idx].reps,
          notes: typeof p.newNotes === "string" ? p.newNotes : list[idx].notes,
        };
        if (section === "warmups") dayObj.warmups = list;
        else if (section === "finishers") dayObj.finishers = list;
        else dayObj.exercises = list;
        plan.workoutPlan.weeklyPlan[dayIndex] = dayObj;
        changed = true;
        touchedPlan = true;
        applied.push("swap_exercise");
        break;
      }
      case "add_exercise": {
        const plan = state.plan;
        const p = act.payload;
        const day = typeof p.day === "string" ? p.day : "";
        const exerciseName = typeof p.exerciseName === "string" ? p.exerciseName : "";
        if (!plan || !day || !exerciseName) {
          skipped.push({ type: act.type, reason: "missing plan, day, or exercise name" });
          break;
        }
        const dayIndex = findDayIndex(plan, day);
        if (dayIndex < 0) {
          skipped.push({ type: act.type, reason: `day not found: ${day}` });
          break;
        }
        const dayObj = plan.workoutPlan.weeklyPlan[dayIndex];
        const newEx: WorkoutExercise = {
          name: exerciseName,
          sets: typeof p.sets === "string" ? p.sets : "3",
          reps: typeof p.reps === "string" ? p.reps : "10",
          notes: typeof p.notes === "string" ? p.notes : undefined,
        };
        const section =
          p.section === "warmups" || p.section === "finishers" ? p.section : "exercises";
        if (section === "warmups") dayObj.warmups = [...(dayObj.warmups ?? []), newEx];
        else if (section === "finishers") dayObj.finishers = [...(dayObj.finishers ?? []), newEx];
        else dayObj.exercises = [...dayObj.exercises, newEx];
        plan.workoutPlan.weeklyPlan[dayIndex] = dayObj;
        changed = true;
        touchedPlan = true;
        applied.push("add_exercise");
        break;
      }
      case "update_workout_day": {
        const plan = state.plan;
        const p = act.payload;
        const day = typeof p.day === "string" ? p.day : "";
        const focus = typeof p.focus === "string" ? p.focus : "";
        if (!plan || !day || !focus) {
          skipped.push({ type: act.type, reason: "missing plan, day, or focus" });
          break;
        }
        const dayIndex = findDayIndex(plan, day);
        if (dayIndex < 0) {
          skipped.push({ type: act.type, reason: `day not found: ${day}` });
          break;
        }
        const dayObj = plan.workoutPlan.weeklyPlan[dayIndex];
        dayObj.focus = focus;
        if (Array.isArray(p.warmups)) dayObj.warmups = p.warmups as WorkoutExercise[];
        if (Array.isArray(p.exercises)) dayObj.exercises = p.exercises as WorkoutExercise[];
        if (Array.isArray(p.finishers)) dayObj.finishers = p.finishers as WorkoutExercise[];
        plan.workoutPlan.weeklyPlan[dayIndex] = dayObj;
        changed = true;
        touchedPlan = true;
        applied.push("update_workout_day");
        break;
      }
      case "regenerate_plan":
        regeneratePlan = true;
        regeneratePlanOptions = parseRegeneratePlanPayload(act.payload);
        applied.push("regenerate_plan");
        break;
      case "adjust_program_start": {
        const plan = state.plan;
        const startDate = act.payload.startDate;
        if (!plan || typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
          skipped.push({ type: act.type, reason: "missing plan or valid startDate" });
          break;
        }
        plan.workoutPlan.programWeek1Start = getWeekStart(startDate);
        plan.workoutPlan.programWeekOffset = 0;
        changed = true;
        touchedPlan = true;
        applied.push("adjust_program_start");
        break;
      }
      default:
        skipped.push({ type: act.type, reason: "unsupported on this client" });
        break;
    }
  }

  return {
    changed,
    touchedMeals,
    touchedPlan,
    regeneratePlan,
    regeneratePlanOptions,
    applied,
    skipped,
  };
}

export function formatRicoApplyStatus(result: RicoApplyResult): string {
  const parts: string[] = [];
  if (result.applied.length > 0) {
    parts.push(`Applied ${result.applied.length} change(s).`);
  }
  if (result.skipped.length > 0) {
    const detail = result.skipped.map((s) => `${s.type} (${s.reason})`).join("; ");
    parts.push(`Ref couldn't apply: ${detail}`);
  }
  return parts.length ? `\n\n${parts.join(" ")}` : "";
}

/** Web client: apply to localStorage, sync, and broadcast UI refresh. */
export function processRicoActions(
  actions: RicoActionWire[],
  opts?: ApplyRicoOptions,
): RicoApplyResult {
  const meals = getMeals();
  const plan = getPlan();
  const result = applyRicoActionsToState(actions, { meals, plan }, opts);
  if (result.touchedMeals) saveMeals(meals);
  if (result.touchedPlan && plan) savePlan(plan);
  if (result.changed) {
    syncToServer();
    window.dispatchEvent(new Event("userDataUpdated"));
  }
  return result;
}
