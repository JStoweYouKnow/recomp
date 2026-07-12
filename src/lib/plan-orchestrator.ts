import type { FitnessPlan, UserProfile } from "./types";
import {
  appendWorkoutWeeks,
  applyMultiWeekProgramMetadata,
  chunkWeekRanges,
  clampProgramWeeks,
  clampWorkoutDaysPerWeek,
  extractWeek1TrainingTemplate,
  type RegeneratePlanOptions,
} from "./multi-week-plan";

export type PlanGenerateProgress = {
  completedWeeks: number;
  totalWeeks: number;
  phase: "week1" | "workouts" | "done";
};

type GenerateWorkoutsChunkResponse = {
  workoutDays: FitnessPlan["workoutPlan"]["weeklyPlan"];
  error?: string;
};

export async function generatePlanWithOptions(
  buildBody: (profile: UserProfile, options: RegeneratePlanOptions) => Record<string, unknown>,
  profile: UserProfile,
  options: RegeneratePlanOptions = {},
  onProgress?: (p: PlanGenerateProgress) => void
): Promise<FitnessPlan> {
  const totalWeeks = clampProgramWeeks(options.programWeeks ?? 1);
  const daysPerWeek = clampWorkoutDaysPerWeek(
    options.workoutDaysPerWeek ?? profile.workoutDaysPerWeek ?? 4
  );

  onProgress?.({ completedWeeks: 0, totalWeeks, phase: "week1" });

  const week1Res = await fetch("/api/plans/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      buildBody(profile, {
        ...options,
        programWeeks: totalWeeks,
        workoutDaysPerWeek: daysPerWeek,
      })
    ),
  });
  const week1Plan = (await week1Res.json()) as FitnessPlan & { error?: string };
  if (!week1Res.ok || week1Plan.error) {
    throw new Error(week1Plan.error ?? "Plan generation failed");
  }

  let plan = totalWeeks > 1 ? applyMultiWeekProgramMetadata(week1Plan, totalWeeks) : week1Plan;
  onProgress?.({ completedWeeks: 1, totalWeeks, phase: totalWeeks > 1 ? "workouts" : "done" });

  if (totalWeeks <= 1) return plan;

  const template = extractWeek1TrainingTemplate(plan.workoutPlan.weeklyPlan);
  if (template.length === 0) {
    throw new Error("Week 1 has no training days to extend into a multi-week program.");
  }

  for (const { fromWeek, toWeek } of chunkWeekRanges(totalWeeks)) {
    const chunkRes = await fetch("/api/plans/generate-workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromWeek,
        toWeek,
        programWeeks: totalWeeks,
        workoutDaysPerWeek: daysPerWeek,
        week1Template: template,
        reason: options.reason,
        profile: {
          name: profile.name,
          goal: profile.goal,
          fitnessLevel: profile.fitnessLevel,
          workoutLocation: profile.workoutLocation,
          workoutEquipment: profile.workoutEquipment,
          injuriesOrLimitations: profile.injuriesOrLimitations,
          workoutDaysPerWeek: daysPerWeek,
        },
      }),
    });
    const chunk = (await chunkRes.json()) as GenerateWorkoutsChunkResponse;
    if (!chunkRes.ok || chunk.error) {
      throw new Error(chunk.error ?? `Failed generating weeks ${fromWeek}–${toWeek}`);
    }
    plan = appendWorkoutWeeks(plan, chunk.workoutDays);
    onProgress?.({ completedWeeks: toWeek, totalWeeks, phase: toWeek >= totalWeeks ? "done" : "workouts" });
  }

  return plan;
}
