import type {
  ActivityLogEntry,
  FitnessPlan,
  MealEntry,
  Milestone,
  UserProfile,
  WearableConnection,
  WearableDaySummary,
  WeeklyReview,
} from "./types";

type WorkoutProgressMap = Record<string, string>;

export interface DemoSeedData {
  profile: UserProfile;
  plan: FitnessPlan;
  meals: MealEntry[];
  wearableConnections: WearableConnection[];
  wearableData: WearableDaySummary[];
  milestones: Milestone[];
  xp: number;
  weeklyReview: WeeklyReview;
  activityLog: ActivityLogEntry[];
  workoutProgress: WorkoutProgressMap;
}

function isoDateOffset(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoTimeForDate(date: string, hour: number, minute = 0): string {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

export function buildDemoSeed(): DemoSeedData {
  const nowIso = new Date().toISOString();
  const today = isoDateOffset(0);
  const d1 = isoDateOffset(-1);
  const d2 = isoDateOffset(-2);
  const d3 = isoDateOffset(-3);
  const d4 = isoDateOffset(-4);
  const d5 = isoDateOffset(-5);
  const d6 = isoDateOffset(-6);

  const profile: UserProfile = {
    id: "demo-user-001",
    name: "Jordan",
    age: 31,
    weight: 78,
    height: 178,
    gender: "other",
    fitnessLevel: "intermediate",
    goal: "build_muscle",
    dietaryRestrictions: ["lactose-light"],
    injuriesOrLimitations: ["mild knee sensitivity"],
    dailyActivityLevel: "moderate",
    workoutLocation: "gym",
    workoutEquipment: ["free_weights", "machines", "cardio_machines"],
    workoutDaysPerWeek: 5,
    workoutTimeframe: "evening",
    createdAt: isoTimeForDate(d6, 9),
  };

  const plan: FitnessPlan = {
    id: "demo-plan-001",
    userId: profile.id,
    createdAt: nowIso,
    dietPlan: {
      dailyTargets: { calories: 2300, protein: 180, carbs: 250, fat: 70 },
      weeklyPlan: [
        { day: "Monday", meals: [{ mealType: "breakfast", description: "Greek yogurt + berries + oats", macros: { calories: 520, protein: 38, carbs: 58, fat: 15 } }, { mealType: "lunch", description: "Chicken rice bowl with veggies", macros: { calories: 690, protein: 52, carbs: 74, fat: 18 } }, { mealType: "dinner", description: "Salmon, potatoes, spinach", macros: { calories: 730, protein: 55, carbs: 62, fat: 27 } }] },
        { day: "Tuesday", meals: [{ mealType: "breakfast", description: "Egg scramble + toast + fruit", macros: { calories: 540, protein: 36, carbs: 50, fat: 20 } }, { mealType: "lunch", description: "Turkey wrap + side salad", macros: { calories: 640, protein: 46, carbs: 60, fat: 20 } }, { mealType: "dinner", description: "Beef stir-fry + jasmine rice", macros: { calories: 760, protein: 56, carbs: 72, fat: 25 } }] },
        { day: "Wednesday", meals: [{ mealType: "breakfast", description: "Protein smoothie + banana", macros: { calories: 500, protein: 42, carbs: 52, fat: 14 } }, { mealType: "lunch", description: "Shrimp quinoa bowl", macros: { calories: 680, protein: 50, carbs: 70, fat: 19 } }, { mealType: "dinner", description: "Chicken pasta + greens", macros: { calories: 760, protein: 56, carbs: 82, fat: 20 } }] },
        { day: "Thursday", meals: [{ mealType: "breakfast", description: "Cottage cheese, granola, berries", macros: { calories: 520, protein: 40, carbs: 56, fat: 15 } }, { mealType: "lunch", description: "Tofu rice bowl + edamame", macros: { calories: 660, protein: 42, carbs: 78, fat: 19 } }, { mealType: "dinner", description: "Turkey chili + sweet potato", macros: { calories: 750, protein: 60, carbs: 66, fat: 23 } }] },
        { day: "Friday", meals: [{ mealType: "breakfast", description: "Overnight oats + protein", macros: { calories: 510, protein: 34, carbs: 62, fat: 14 } }, { mealType: "lunch", description: "Chicken burrito bowl", macros: { calories: 710, protein: 54, carbs: 78, fat: 20 } }, { mealType: "dinner", description: "Cod, rice, roasted veg", macros: { calories: 740, protein: 58, carbs: 68, fat: 22 } }] },
        { day: "Saturday", meals: [{ mealType: "breakfast", description: "Eggs + avocado toast", macros: { calories: 560, protein: 34, carbs: 48, fat: 24 } }, { mealType: "lunch", description: "Lean burger + potatoes", macros: { calories: 740, protein: 50, carbs: 74, fat: 27 } }, { mealType: "dinner", description: "Sushi bowl + tofu", macros: { calories: 700, protein: 46, carbs: 82, fat: 18 } }] },
        { day: "Sunday", meals: [{ mealType: "breakfast", description: "Pancakes + turkey bacon", macros: { calories: 590, protein: 30, carbs: 68, fat: 19 } }, { mealType: "lunch", description: "Mediterranean chicken plate", macros: { calories: 690, protein: 54, carbs: 60, fat: 24 } }, { mealType: "dinner", description: "Steak, rice, broccoli", macros: { calories: 760, protein: 60, carbs: 62, fat: 26 } }] },
      ],
      tips: [
        "Anchor each meal with 30-45g protein.",
        "Front-load carbs around training sessions.",
        "Aim for 2.5-3L water daily and stable sodium intake.",
      ],
    },
    workoutPlan: {
      weeklyPlan: [
        { day: "Monday", focus: "Upper Body Push", warmups: [{ name: "Arm Circles", sets: "1", reps: "10 each" }, { name: "Band Pull-Aparts", sets: "1", reps: "15" }], exercises: [{ name: "Bench Press", sets: "4", reps: "6-8" }, { name: "Incline Dumbbell Press", sets: "3", reps: "8-10" }, { name: "Cable Lateral Raise", sets: "3", reps: "12-15" }], finishers: [{ name: "Plank", sets: "2", reps: "45s" }] },
        { day: "Tuesday", focus: "Lower Body Strength", warmups: [{ name: "Hip Circles", sets: "1", reps: "8 each" }, { name: "Bodyweight Squat", sets: "1", reps: "10" }], exercises: [{ name: "Back Squat", sets: "4", reps: "5-6" }, { name: "Romanian Deadlift", sets: "3", reps: "8-10" }, { name: "Walking Lunge", sets: "3", reps: "10/leg" }], finishers: [{ name: "Farmer's Carry", sets: "2", reps: "40m" }] },
        { day: "Wednesday", focus: "Active Recovery", warmups: [{ name: "Cat-Cow Stretch", sets: "1", reps: "8" }], exercises: [{ name: "Incline Walk", sets: "1", reps: "30 min" }, { name: "Hip Flexor Stretch", sets: "2", reps: "30s per side" }], finishers: [] },
        { day: "Thursday", focus: "Upper Body Pull", warmups: [{ name: "Arm Circles", sets: "1", reps: "10 each" }, { name: "Band Pull-Aparts", sets: "1", reps: "15" }], exercises: [{ name: "Pull-Up", sets: "4", reps: "6-8" }, { name: "Seated Cable Row", sets: "3", reps: "8-10" }, { name: "Face Pull", sets: "3", reps: "12-15" }], finishers: [{ name: "Plank", sets: "2", reps: "45s" }] },
        { day: "Friday", focus: "Lower + Conditioning", warmups: [{ name: "Hip Circles", sets: "1", reps: "8 each" }, { name: "Bodyweight Squat", sets: "1", reps: "10" }], exercises: [{ name: "Front Squat", sets: "3", reps: "6-8" }, { name: "Leg Press", sets: "3", reps: "10-12" }, { name: "Bike Intervals", sets: "8", reps: "30s on / 60s off" }], finishers: [{ name: "Jump Rope", sets: "1", reps: "2 min" }] },
        { day: "Saturday", focus: "Optional Full Body", warmups: [{ name: "Dynamic Stretch", sets: "1", reps: "5 min" }], exercises: [{ name: "Dumbbell Romanian Deadlift", sets: "3", reps: "8-10" }, { name: "Push-Up", sets: "3", reps: "AMRAP" }], finishers: [] },
        { day: "Sunday", focus: "Rest", warmups: [], exercises: [], finishers: [] },
      ],
      tips: [
        "Keep 1-2 reps in reserve on compound lifts.",
        "Prioritize technique before load progression.",
        "Sleep 7+ hours for recovery and muscle retention.",
      ],
    },
    reasoning: "Demo seed plan generated to showcase balanced recomposition programming and realistic meal targets.",
  };

  const meals: MealEntry[] = [
    { id: "m-1", date: d6, mealType: "breakfast", name: "Overnight oats + whey", macros: { calories: 510, protein: 36, carbs: 62, fat: 13 }, loggedAt: isoTimeForDate(d6, 8, 10) },
    { id: "m-2", date: d6, mealType: "dinner", name: "Salmon rice bowl", macros: { calories: 720, protein: 51, carbs: 66, fat: 24 }, loggedAt: isoTimeForDate(d6, 19, 20) },
    { id: "m-3", date: d5, mealType: "lunch", name: "Chicken quinoa salad", macros: { calories: 640, protein: 48, carbs: 58, fat: 20 }, loggedAt: isoTimeForDate(d5, 12, 35) },
    { id: "m-4", date: d5, mealType: "snack", name: "Greek yogurt + berries", macros: { calories: 260, protein: 24, carbs: 28, fat: 5 }, loggedAt: isoTimeForDate(d5, 16, 10) },
    { id: "m-5", date: d4, mealType: "breakfast", name: "Egg wrap + fruit", macros: { calories: 470, protein: 30, carbs: 46, fat: 18 }, loggedAt: isoTimeForDate(d4, 8, 0) },
    { id: "m-6", date: d4, mealType: "dinner", name: "Turkey chili + potato", macros: { calories: 760, protein: 58, carbs: 70, fat: 23 }, loggedAt: isoTimeForDate(d4, 19, 15) },
    { id: "m-7", date: d3, mealType: "lunch", name: "Beef stir-fry", macros: { calories: 710, protein: 50, carbs: 68, fat: 24 }, loggedAt: isoTimeForDate(d3, 13, 5) },
    { id: "m-8", date: d2, mealType: "dinner", name: "Cod + sweet potato", macros: { calories: 690, protein: 56, carbs: 58, fat: 22 }, loggedAt: isoTimeForDate(d2, 19, 0) },
    { id: "m-9", date: d1, mealType: "breakfast", name: "Protein smoothie", macros: { calories: 430, protein: 40, carbs: 42, fat: 11 }, loggedAt: isoTimeForDate(d1, 7, 50) },
    { id: "m-10", date: d1, mealType: "lunch", name: "Shrimp rice bowl", macros: { calories: 670, protein: 49, carbs: 72, fat: 18 }, loggedAt: isoTimeForDate(d1, 12, 30) },
    { id: "m-11", date: today, mealType: "breakfast", name: "Egg scramble + toast", macros: { calories: 520, protein: 35, carbs: 50, fat: 19 }, loggedAt: isoTimeForDate(today, 8, 20) },
    { id: "m-12", date: today, mealType: "lunch", name: "Chicken burrito bowl", macros: { calories: 730, protein: 54, carbs: 76, fat: 21 }, loggedAt: isoTimeForDate(today, 12, 40) },
  ];

  const wearableConnections: WearableConnection[] = [
    { provider: "fitbit", connectedAt: isoTimeForDate(d5, 10), label: "Demo Fitbit" },
  ];

  const wearableData: WearableDaySummary[] = [
    { date: d4, provider: "fitbit", steps: 8420, caloriesBurned: 2380, activeMinutes: 51, sleepScore: 80, sleepDuration: 425, heartRateResting: 61 },
    { date: d3, provider: "fitbit", steps: 10210, caloriesBurned: 2520, activeMinutes: 62, sleepScore: 84, sleepDuration: 438, heartRateResting: 60 },
    { date: d2, provider: "fitbit", steps: 9170, caloriesBurned: 2440, activeMinutes: 57, sleepScore: 82, sleepDuration: 430, heartRateResting: 60 },
    { date: d1, provider: "fitbit", steps: 11140, caloriesBurned: 2610, activeMinutes: 68, sleepScore: 86, sleepDuration: 446, heartRateResting: 59 },
    { date: today, provider: "fitbit", steps: 6240, caloriesBurned: 2140, activeMinutes: 38, sleepScore: 79, sleepDuration: 410, heartRateResting: 62 },
  ];

  const milestones: Milestone[] = [
    { id: "first_meal", earnedAt: isoTimeForDate(d6, 8, 11) },
    { id: "meal_streak_3", earnedAt: isoTimeForDate(d3, 9, 30) },
    { id: "meal_streak_7", earnedAt: isoTimeForDate(today, 9, 30) },
    { id: "wearable_synced", earnedAt: isoTimeForDate(d1, 10, 45) },
  ];

  const weeklyReview: WeeklyReview = {
    id: "wr-demo-001",
    createdAt: nowIso,
    summary: "Strong consistency this week with protein targets and workout completion. Biggest opportunity: tighten evening snacking and improve sleep by ~30 minutes.",
    mealAnalysis: "Average intake aligns to recomposition targets. Protein is stable (165-185g/day), carbs are well-timed around workouts, and calorie variance is moderate.",
    wearableInsights: "Steps trended up across the week with good activity minutes. Sleep score improved mid-week but dipped after late training on one day.",
    recommendations: [
      "Add a pre-bed routine to target +30 minutes sleep on training nights.",
      "Keep lunch protein >=45g to reduce evening hunger.",
      "Preserve current 4-5 day lifting cadence with one full recovery day.",
    ],
    reasoning: "Coordinator aggregated meal logs and wearable trends, then synthesized recommendations weighted by recomposition goal and current adherence pattern.",
    agentSteps: [
      { tool: "meal_analyst", summary: "Reviewed meal timing and macro consistency." },
      { tool: "wellness_agent", summary: "Analyzed activity and sleep trends from wearables." },
      { tool: "synthesis_agent", summary: "Generated actionable next-week adjustments." },
    ],
  };

  const activityLog: ActivityLogEntry[] = [
    { id: "a-1", date: d1, type: "activity", label: "Lower body workout", category: "workout", durationMinutes: 58, calorieAdjustment: 210, loggedAt: isoTimeForDate(d1, 18, 30) },
    { id: "a-2", date: today, type: "activity", label: "Incline treadmill walk", category: "walking", durationMinutes: 35, calorieAdjustment: 140, loggedAt: isoTimeForDate(today, 7, 20) },
    { id: "a-3", date: today, type: "sedentary", label: "Long desk block", category: "desk_work", durationMinutes: 160, calorieAdjustment: -60, loggedAt: isoTimeForDate(today, 15, 15) },
  ];

  const workoutProgress: WorkoutProgressMap = {
    [`${plan.id}:Monday:Bench Press:4:6-8:`]: isoTimeForDate(d4, 19, 25),
    [`${plan.id}:Monday:Incline Dumbbell Press:3:8-10:`]: isoTimeForDate(d4, 19, 36),
    [`${plan.id}:Tuesday:Back Squat:4:5-6:`]: isoTimeForDate(d3, 18, 40),
    [`${plan.id}:Thursday:Pull-Up:4:6-8:`]: isoTimeForDate(d1, 19, 5),
  };

  return {
    profile,
    plan,
    meals,
    wearableConnections,
    wearableData,
    milestones,
    xp: 420,
    weeklyReview,
    activityLog,
    workoutProgress,
  };
}
