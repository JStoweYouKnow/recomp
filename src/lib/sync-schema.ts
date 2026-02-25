import { z } from "zod";

/** Max payload size (bytes) to prevent abuse */
export const SYNC_MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB

const macrosSchema = z.object({
  calories: z.number().min(0).max(50000).optional(),
  protein: z.number().min(0).max(2000).optional(),
  carbs: z.number().min(0).max(2000).optional(),
  fat: z.number().min(0).max(2000).optional(),
});

const mealEntrySchema = z.object({
  id: z.string().max(100),
  date: z.string().max(20),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().max(500),
  macros: macrosSchema,
  notes: z.string().max(1000).optional(),
  loggedAt: z.string().max(50).optional(),
});

const milestoneSchema = z.object({
  id: z.string().max(50),
  earnedAt: z.string().max(50),
  progress: z.number().min(0).max(100).optional(),
});

const ricoMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(10000),
  at: z.string().max(50),
});

const wearableConnectionSchema = z.object({
  provider: z.enum(["oura", "fitbit", "apple", "garmin", "android", "scale"]),
  connectedAt: z.string().max(50),
  label: z.string().max(100).optional(),
});

const wearableDaySummarySchema = z.object({
  date: z.string().max(20),
  provider: z.enum(["oura", "fitbit", "apple", "garmin", "android", "scale"]),
  steps: z.number().min(0).max(1000000).optional(),
  caloriesBurned: z.number().min(0).max(50000).optional(),
  activeMinutes: z.number().min(0).max(1440).optional(),
  sleepScore: z.number().min(0).max(100).optional(),
  sleepDuration: z.number().min(0).max(1440).optional(),
  readinessScore: z.number().min(0).max(100).optional(),
  heartRateAvg: z.number().min(20).max(300).optional(),
  heartRateResting: z.number().min(20).max(200).optional(),
  weight: z.number().min(0).max(500).optional(),
  bodyFatPercent: z.number().min(0).max(100).optional(),
  muscleMass: z.number().min(0).max(500).optional(),
}).passthrough();

const dietDaySchema = z.object({
  day: z.string().max(50),
  meals: z.array(z.object({
    mealType: z.string().max(20),
    description: z.string().max(500),
    macros: macrosSchema,
  })).max(10),
}).passthrough();

const workoutDaySchema = z.object({
  day: z.string().max(50),
  focus: z.string().max(200),
  exercises: z.array(z.object({
    name: z.string().max(200),
    sets: z.string().max(20),
    reps: z.string().max(20),
    notes: z.string().max(500).optional(),
  })).max(50),
}).passthrough();

const fitnessPlanSchema = z.object({
  id: z.string().max(100),
  userId: z.string().max(100),
  createdAt: z.string().max(50),
  dietPlan: z.object({
    dailyTargets: macrosSchema.optional(),
    weeklyPlan: z.array(dietDaySchema).max(14).optional(),
    tips: z.array(z.string().max(500)).max(20).optional(),
  }).passthrough(),
  workoutPlan: z.object({
    weeklyPlan: z.array(workoutDaySchema).max(14).optional(),
    tips: z.array(z.string().max(500)).max(20).optional(),
  }).passthrough(),
  reasoning: z.string().max(5000).optional(),
}).passthrough();

export const syncBodySchema = z.object({
  plan: fitnessPlanSchema.optional().nullable(),
  meals: z.array(mealEntrySchema).max(5000).optional(),
  milestones: z.array(milestoneSchema).max(500).optional(),
  xp: z.number().min(0).max(1_000_000).optional(),
  hasAdjusted: z.boolean().optional(),
  ricoHistory: z.array(ricoMessageSchema).max(100).optional(),
  wearableConnections: z.array(wearableConnectionSchema).max(20).optional(),
  wearableData: z.array(wearableDaySummarySchema).max(2000).optional(),
});

export type SyncBody = z.infer<typeof syncBodySchema>;
