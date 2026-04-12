export type FitnessLevel = "beginner" | "intermediate" | "advanced" | "athlete";
export type Goal = "lose_weight" | "maintain" | "build_muscle" | "improve_endurance";
export type WorkoutLocation = "home" | "gym" | "outside";
export type WorkoutEquipment =
  | "bodyweight"
  | "free_weights"
  | "barbells"
  | "kettlebells"
  | "machines"
  | "resistance_bands"
  | "cardio_machines"
  | "pull_up_bar"
  | "cable_machine";

export interface UserProfile {
  id: string;
  name: string;
  avatarDataUrl?: string;
  age: number;
  weight: number;
  height: number;
  gender: "male" | "female" | "other";
  fitnessLevel: FitnessLevel;
  goal: Goal;
  dietaryRestrictions: string[];
  injuriesOrLimitations: string[];
  dailyActivityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  workoutLocation?: WorkoutLocation;
  workoutEquipment?: WorkoutEquipment[];
  workoutDaysPerWeek?: number;
  workoutTimeframe?: "morning" | "afternoon" | "evening" | "flexible";
  createdAt: string;
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealEntry {
  id: string;
  date: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  macros: Macros;
  notes?: string;
  imageUrl?: string;
  loggedAt: string;
}

export interface WorkoutExercise {
  name: string;
  sets: string;
  reps: string;
  notes?: string;
}

export interface WorkoutDay {
  day: string;
  focus: string;
  warmups?: WorkoutExercise[];
  exercises: WorkoutExercise[];
  finishers?: WorkoutExercise[];
}

export interface DietDay {
  day: string;
  meals: {
    mealType: string;
    description: string;
    macros: Macros;
  }[];
}

export interface FitnessPlan {
  id: string;
  userId: string;
  createdAt: string;
  dietPlan: {
    dailyTargets: Macros;
    weeklyPlan: DietDay[];
    tips: string[];
  };
  workoutPlan: {
    weeklyPlan: WorkoutDay[];
    tips: string[];
  };
  reasoning?: string;
}

export interface MeasurementTargets {
  targetWeightLbs?: number;
  targetBodyFatPercent?: number;
  targetMuscleMassLbs?: number;
}

export interface WearableConnection {
  provider: WearableProvider;
  connectedAt: string;
  label?: string;
}

export interface ActivityLogEntry {
  id: string;
  date: string;
  type: "activity" | "sedentary";
  label: string;
  category: string;
  durationMinutes: number;
  calorieAdjustment: number;
  loggedAt: string;
}

export interface RicoMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface WeeklyReview {
  id: string;
  createdAt: string;
  summary: string;
  mealAnalysis: string;
  wearableInsights: string;
  recommendations: string[];
  reasoning: string;
  agentSteps: { tool: string; summary: string }[];
}

export type WearableProvider = "oura" | "fitbit" | "apple" | "garmin" | "android" | "scale";

export interface WearableDaySummary {
  date: string;
  /** Required for sync; defaults to scale/oura/fitbit based on source when missing */
  provider?: WearableProvider;
  steps?: number;
  sleepHours?: number;
  sleepScore?: number;
  sleepDuration?: number;
  readinessScore?: number;
  avgHeartRate?: number;
  heartRateAvg?: number;
  heartRateResting?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
  weight?: number;
  bodyFatPercent?: number;
  muscleMass?: number;
  bmi?: number;
  source?: string; // legacy
}

export interface Milestone {
  id: string;
  earnedAt: string;
  progress?: number;
}
