/**
 * Post-workout AI recommendations based on completion history.
 */

import { invokeRico, type RicoContext } from "./rico";
import {
  buildRicoWorkoutLearningContext,
  type CompletedSessionSummary,
} from "../workout-learning";
import type { FitnessPlan, WorkoutSetLog } from "../types";
import type { WorkoutProgressMap } from "../workout-schedule";

export interface PostWorkoutRecommendationInput {
  plan: FitnessPlan;
  progress: WorkoutProgressMap;
  completedSession: CompletedSessionSummary;
  setLogs?: WorkoutSetLog[];
  profile?: { name?: string; goal?: string };
  meals?: Parameters<typeof buildBaseContext>[0]["meals"];
  xp?: number;
}

export interface PostWorkoutRecommendationResult {
  reply: string;
  actions: { type: string; payload: Record<string, unknown> }[];
  completedSession: CompletedSessionSummary;
  nextWorkout: RicoContext["nextWorkout"];
}

function buildBaseContext(data: {
  plan: FitnessPlan;
  progress: WorkoutProgressMap;
  setLogs?: WorkoutSetLog[];
  profile?: { name?: string; goal?: string };
  meals?: { date: string }[];
  xp?: number;
  completedSession: CompletedSessionSummary;
}): RicoContext {
  const learning = buildRicoWorkoutLearningContext(
    data.plan,
    data.progress,
    data.completedSession.date,
    data.setLogs ?? [],
  );
  const streak = computeMealStreak(data.meals ?? []);

  return {
    name: data.profile?.name,
    goal: data.profile?.goal,
    streak,
    mealsLogged: (data.meals ?? []).filter((m) => m.date === data.completedSession.date).length,
    xp: data.xp,
    workoutPlan: data.plan.workoutPlan,
    completedWorkoutToday: data.completedSession,
    workoutHistory: learning.workoutHistory,
    nextWorkout: learning.nextWorkout,
    workoutPerformance: learning.workoutPerformance,
  };
}

function computeMealStreak(meals: { date: string }[]): number {
  const dates = new Set(meals.map((m) => m.date.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (!dates.has(key)) break;
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export async function generatePostWorkoutRecommendation(
  input: PostWorkoutRecommendationInput,
): Promise<PostWorkoutRecommendationResult> {
  const { plan, progress, completedSession, setLogs, profile, meals, xp } = input;
  const context = buildBaseContext({ plan, progress, setLogs, profile, meals, xp, completedSession });

  const nextLabel = context.nextWorkout
    ? `${context.nextWorkout.day} (${context.nextWorkout.focus})`
    : "their next scheduled session";

  const perfHint =
    completedSession.performance?.exerciseHighlights?.length
      ? ` Logged performance: ${completedSession.performance.exerciseHighlights
          .slice(0, 4)
          .map((h) => {
            const top = h.lastSets.find((s) => s.weightLbs != null);
            return top?.weightLbs != null
              ? `${h.exerciseName} ${top.weightLbs}×${top.reps ?? "?"}`
              : h.exerciseName;
          })
          .join(", ")}.`
      : "";

  const message = `[SYSTEM: The user just finished ${completedSession.focus} on ${completedSession.day} (${completedSession.exerciseCount} exercises: ${completedSession.exercisesCompleted.join(", ")}).${perfHint} Review their workoutHistory, workoutPerformance, and nextWorkout in context. Give a brief celebration, recovery nutrition guidance, and 1-2 specific adaptations for ${nextLabel}. Use swap_exercise, add_exercise, or update_workout_day when you recommend concrete plan changes — progressive overload based on logged weights/reps/RPE, variety, or deload based on recent completion patterns. Respect injuries and equipment.]`;

  const { reply, actions } = await invokeRico({ message, context });

  return {
    reply,
    actions,
    completedSession,
    nextWorkout: context.nextWorkout,
  };
}
