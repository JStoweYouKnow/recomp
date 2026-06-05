import { z } from "zod";

/** Max payload size (bytes) to prevent abuse */
export const SYNC_MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB

// Flexible profile schema — iOS sends this on every sync. We use passthrough so
// future fields don't break validation, and the route upserts it into DynamoDB so
// the GET endpoint (which returns 404 when no profile exists) always succeeds.
export const syncProfileSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  email: z.string().max(200).optional(),
  age: z.number().int().min(0).max(150).optional(),
  weight: z.number().min(0).max(1000).optional(),
  height: z.number().min(0).max(300).optional(),
  gender: z.string().max(20).optional(),
  fitnessLevel: z.string().max(30).optional(),
  goal: z.string().max(50).optional(),
  dietaryRestrictions: z.array(z.string().max(100)).max(50).optional(),
  injuriesOrLimitations: z.array(z.string().max(200)).max(50).optional(),
  dailyActivityLevel: z.string().max(30).optional(),
  unitSystem: z.string().max(20).optional(),
  workoutLocation: z.string().max(30).optional(),
  workoutEquipment: z.array(z.string().max(50)).max(20).optional(),
  workoutDaysPerWeek: z.number().int().min(0).max(14).optional(),
  workoutTimeframe: z.string().max(30).optional(),
  createdAt: z.string().max(50).optional(),
}).passthrough();

const macrosSchema = z.object({
  calories: z.number().min(0).max(50000).optional(),
  protein: z.number().min(0).max(2000).optional(),
  carbs: z.number().min(0).max(2000).optional(),
  fat: z.number().min(0).max(2000).optional(),
});

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

function normalizeSyncMealType(value: unknown): (typeof MEAL_TYPES)[number] {
  if (typeof value !== "string") return "snack";
  const x = value.trim().toLowerCase();
  return (MEAL_TYPES as readonly string[]).includes(x) ? (x as (typeof MEAL_TYPES)[number]) : "snack";
}

function defaultMacros(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

// Ensures calories is never 0 when macros are present — derived as P*4 + C*4 + F*9 if missing.
// This prevents cross-platform parity drift where one client stores calories=0 while another
// derives calories from the same protein/carbs/fat values and gets a different total.
function normalizeMealMacros(m: {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}): { calories: number; protein: number; carbs: number; fat: number } {
  const p = m.protein ?? 0;
  const c = m.carbs ?? 0;
  const f = m.fat ?? 0;
  const stored = m.calories ?? 0;
  return {
    calories: stored > 0 ? stored : Math.round(p * 4 + c * 4 + f * 9),
    protein: p,
    carbs: c,
    fat: f,
  };
}

const mealEntrySchema = z.object({
  id: z.string().max(100),
  date: z.string().max(20),
  mealType: z.preprocess(normalizeSyncMealType, z.enum(MEAL_TYPES)),
  name: z.string().max(500),
  macros: z.preprocess(defaultMacros, macrosSchema).transform(normalizeMealMacros),
  notes: z.string().max(1000).optional(),
  imageUrl: z.string().max(2000000).optional(),
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

const wearableDaySummarySchema = z.looseObject({
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
  /** Raw mass — converted using `weightUnit` (default lbs) server-side before storage. */
  weight: z.number().min(0).max(1100).optional(),
  weightUnit: z.enum(["lbs", "kg"]).optional(),
  bodyFatPercent: z.number().min(0).max(100).optional(),
  /** Upper bound tolerates transient kg payloads before normalization to lbs. */
  muscleMass: z.number().min(0).max(650).optional(),
  muscleMassUnit: z.enum(["lbs", "kg"]).optional(),
  manualEntryId: z.string().uuid().optional(),
}).passthrough();

const dietDaySchema = z.looseObject({
  day: z.string().max(50),
  meals: z.array(z.object({
    mealType: z.string().max(20),
    description: z.string().max(500),
    macros: macrosSchema,
  })).max(10),
});

const workoutExerciseSchema = z.object({
  name: z.string().max(200),
  sets: z.string().max(20),
  reps: z.string().max(20),
  notes: z.string().max(500).optional(),
});
const workoutDaySchema = z.looseObject({
  day: z.string().max(50),
  focus: z.string().max(200),
  warmups: z.array(workoutExerciseSchema).max(20).optional(),
  exercises: z.array(workoutExerciseSchema).max(50),
  finishers: z.array(workoutExerciseSchema).max(20).optional(),
});

const fitnessPlanSchema = z.looseObject({
  id: z.string().max(100),
  userId: z.string().max(100),
  createdAt: z.string().max(50),
  dietPlan: z.looseObject({
    dailyTargets: macrosSchema.optional(),
    /** LLM plans + multi-week templates can exceed one calendar week */
    weeklyPlan: z.array(dietDaySchema).max(60).optional(),
    tips: z.array(z.string().max(500)).max(20).optional(),
  }).passthrough(),
  workoutPlan: z.looseObject({
    /** Multi-week PDF programs (e.g. 12 weeks × 3 days) exceed a single calendar week. */
    weeklyPlan: z.array(workoutDaySchema).max(120).optional(),
    tips: z.array(z.string().max(500)).max(20).optional(),
    programWeek1Start: z.string().max(12).optional(),
  }),
  reasoning: z.string().max(5000).optional(),
});

const hydrationEntrySchema = z.object({
  id: z.string().max(100),
  date: z.string().max(20),
  time: z.string().max(10),
  amountMl: z.number().min(0).max(10000),
  source: z.enum(["water", "coffee", "tea", "sports_drink", "other"]).optional(),
});

const fastingSessionSchema = z.object({
  id: z.string().max(100),
  startTime: z.string().max(50),
  endTime: z.string().max(50).optional(),
  targetHours: z.number().min(1).max(168),
  protocol: z.enum(["16:8", "18:6", "20:4", "OMAD", "custom"]),
});

const biofeedbackEntrySchema = z.object({
  id: z.string().max(100),
  date: z.string().max(20),
  time: z.string().max(10),
  energy: z.number().min(1).max(5),
  mood: z.number().min(1).max(5),
  hunger: z.number().min(1).max(5),
  stress: z.number().min(1).max(5),
  soreness: z.number().min(1).max(5),
  notes: z.string().max(1000).optional(),
});

const pantryItemSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  category: z.enum(["protein", "carb", "fat", "produce", "dairy", "spice", "other"]),
  addedAt: z.string().max(50),
  expiresAt: z.string().max(50).optional(),
});

const bodyScanSchema = z.object({
  id: z.string().max(100),
  date: z.string().max(20),
  photos: z.object({
    front: z.string().optional(),
    side: z.string().optional(),
    back: z.string().optional(),
  }),
  analysis: z.string().max(5000).optional(),
  bodyFatEstimate: z.number().min(0).max(100).optional(),
  muscleAssessment: z.string().max(2000).optional(),
  notes: z.string().max(1000).optional(),
});

const supplementSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  dosage: z.string().max(100),
  frequency: z.enum(["daily", "twice_daily", "weekly", "as_needed"]),
  timing: z.enum(["morning", "afternoon", "evening", "with_meals", "before_bed"]),
  takenToday: z.boolean().optional(),
});

const bloodWorkMarkerSchema = z.object({
  name: z.string().max(200),
  value: z.number(),
  unit: z.string().max(50),
  normalRange: z.object({ low: z.number(), high: z.number() }),
  status: z.enum(["low", "normal", "high"]),
});

const bloodWorkSchema = z.object({
  id: z.string().max(100),
  date: z.string().max(20),
  markers: z.array(bloodWorkMarkerSchema).max(100),
  notes: z.string().max(1000).optional(),
});

const activityLogEntrySchema = z.object({
  id: z.string().max(100),
  date: z.string().max(20),
  type: z.enum(["activity", "sedentary"]),
  label: z.string().max(200),
  category: z.string().max(50),
  durationMinutes: z.number().min(0).max(1440),
  calorieAdjustment: z.number().min(-5000).max(5000),
  loggedAt: z.string().max(50).optional(),
});

const workoutProgressMapSchema = z.record(z.string().max(2000), z.string().max(5000));

const metabolicDataPointSchema = z.object({
  date: z.string().max(50),
  weightKg: z.number(),
  totalIntake: z.number(),
  totalExpenditure: z.number(),
});

const metabolicModelSchema = z.looseObject({
  estimatedTDEE: z.number(),
  confidence: z.number(),
  dataPoints: z.array(metabolicDataPointSchema).max(5000),
  lastUpdated: z.string().max(50),
  history: z.array(z.object({
    /** Matches `new Date().toISOString()` from /api/metabolic/update */
    date: z.string().max(50),
    tdee: z.number(),
    confidence: z.number(),
  })).max(5000),
});

const measurementTargetsSchema = z.looseObject({
  targetWeightLbs: z.number().optional(),
  targetBodyFatPercent: z.number().optional(),
  targetMuscleMassLbs: z.number().optional(),
});

// Loose profile schema — unknown fields pass through without breaking validation
const profileSchema = z.looseObject({
  id: z.string().max(100),
  name: z.string().max(80),
  email: z.string().max(254).optional(),
  age: z.number().int().min(10).max(120).optional(),
  weight: z.number().min(20).max(500).optional(),
  height: z.number().min(80).max(260).optional(),
  goal: z.string().max(50).optional(),
  createdAt: z.string().max(50).optional(),
});

export const syncBodySchema = z.object({
  profile: profileSchema.optional().nullable(),
  plan: fitnessPlanSchema.optional().nullable(),
  meals: z.array(mealEntrySchema).max(5000).optional(),
  milestones: z.array(milestoneSchema).max(500).optional(),
  xp: z.number().min(0).max(1_000_000).optional(),
  hasAdjusted: z.boolean().optional(),
  ricoHistory: z.array(ricoMessageSchema).max(100).optional(),
  wearableConnections: z.array(wearableConnectionSchema).max(20).optional(),
  wearableData: z.array(wearableDaySummarySchema).max(2000).optional(),
  hydration: z.array(hydrationEntrySchema).max(5000).optional(),
  fastingSessions: z.array(fastingSessionSchema).max(500).optional(),
  biofeedback: z.array(biofeedbackEntrySchema).max(2000).optional(),
  pantry: z.array(pantryItemSchema).max(500).optional(),
  bodyScans: z.array(bodyScanSchema).max(200).optional(),
  supplements: z.array(supplementSchema).max(100).optional(),
  bloodWork: z.array(bloodWorkSchema).max(100).optional(),
  activityLog: z.array(activityLogEntrySchema).max(5000).optional(),
  workoutProgress: workoutProgressMapSchema.optional(),
  recentExerciseNames: z.array(z.string().max(200)).max(100).optional(),
  metabolicModel: metabolicModelSchema.optional().nullable(),
  measurementTargets: measurementTargetsSchema.optional().nullable(),
});

export type SyncBody = z.infer<typeof syncBodySchema>;
