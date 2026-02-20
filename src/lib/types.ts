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
  avatarDataUrl?: string; // base64 data URL for profile picture
  fullBodyPhotoDataUrl?: string; // base64 data URL for full-body photo
  goalPhotoDataUrl?: string; // AI-generated "after" image based on source photo + goal
  age: number;
  weight: number; // kg
  height: number; // cm
  gender: "male" | "female" | "other";
  fitnessLevel: FitnessLevel;
  goal: Goal;
  dietaryRestrictions: string[];
  injuriesOrLimitations: string[];
  dailyActivityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  workoutLocation?: WorkoutLocation;
  workoutEquipment?: WorkoutEquipment[];
  workoutDaysPerWeek?: number; // 2–7
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
  date: string; // ISO date
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  macros: Macros;
  notes?: string;
  loggedAt: string;
}

export interface WorkoutDay {
  day: string;
  focus: string;
  exercises: {
    name: string;
    sets: string;
    reps: string;
    notes?: string;
  }[];
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

export type WearableProvider = "oura" | "fitbit" | "apple" | "garmin" | "android";

export interface WearableConnection {
  provider: WearableProvider;
  connectedAt: string;
  label?: string;
}

export interface WearableDaySummary {
  date: string;
  provider: WearableProvider;
  steps?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
  sleepScore?: number;
  sleepDuration?: number; // minutes
  readinessScore?: number;
  heartRateAvg?: number;
  heartRateResting?: number;
  workouts?: { name: string; duration: number; calories?: number }[];
}

export type MilestoneType =
  | "first_meal"
  | "meal_streak_3"
  | "meal_streak_7"
  | "meal_streak_14"
  | "meal_streak_30"
  | "macro_hit_week"
  | "macro_hit_month"
  | "week_warrior"
  | "plan_adjuster"
  | "early_adopter"
  | "wearable_synced";

export interface Milestone {
  id: MilestoneType;
  earnedAt: string;
  progress?: number; // for partial progress
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

export type ActivityType =
  | "workout"
  | "walking"
  | "running"
  | "cycling"
  | "swimming"
  | "hiit"
  | "yoga"
  | "sports"
  | "manual_labor"
  | "other";

export type SedentaryType =
  | "desk_work"
  | "gaming"
  | "watching_tv"
  | "nap"
  | "travel"
  | "other";

export interface ActivityLogEntry {
  id: string;
  date: string; // ISO date
  type: "activity" | "sedentary";
  label: string;
  category: ActivityType | SedentaryType;
  durationMinutes: number;
  calorieAdjustment: number; // positive for activity, negative for sedentary
  loggedAt: string;
}

export type CookingAppProvider =
  | "whisk"
  | "mealime"
  | "yummly"
  | "paprika"
  | "cronometer"
  | "myfitnesspal"
  | "loseit"
  | "recipekeeper"
  | "nytcooking"
  | "custom";

export interface CookingAppConnection {
  provider: CookingAppProvider;
  label?: string;
  connectedAt: string;
  webhookSecret?: string; // HMAC secret for verifying inbound webhooks
}

export interface CookingAppMealPayload {
  provider: CookingAppProvider;
  externalId?: string;
  name: string;
  mealType?: MealEntry["mealType"];
  date?: string; // ISO date, defaults to today
  servings?: number;
  macros: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
  };
  ingredients?: { name: string; amount?: string; calories?: number }[];
  recipeUrl?: string;
  notes?: string;
}

/** Saved recipe from a cooking app or import — used to improve meal suggestions (gourmet options within calorie budget) */
export interface CookingAppRecipe {
  id: string;
  name: string;
  description?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source?: string; // e.g. "whisk", "import"
  addedAt: string;
}
