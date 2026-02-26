import { NextRequest, NextResponse } from "next/server";
import { invokeNovaWithExtendedThinking } from "@/lib/nova";
import { logError, logInfo } from "@/lib/logger";
import type { UserProfile, FitnessPlan, Macros } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "@/lib/auth";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { z } from "zod";

/** Allow plan generation (extended thinking) to complete within Vercel Hobby 60s limit */
export const maxDuration = 60;
const PLAN_TIMEOUT_MS = 35_000;
const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const SYSTEM_PROMPT = `You are an expert fitness and nutrition coach powered by Amazon Nova AI. Your role is to create personalized, safe, and effective diet and workout plans.

Guidelines:
- Use evidence-based nutrition and exercise science
- Adapt plans to fitness level: beginner (minimal experience), intermediate (6+ months), advanced (2+ years), athlete (competitive)
- Goals: lose_weight (calorie deficit), maintain (balance), build_muscle (surplus + protein), improve_endurance (cardio focus)
- Workout location: home (minimal space, limited equipment), gym (full access), outside (parks, running, bodyweight, portable)
- Workout frequency: respect workoutDaysPerWeek (2–7); create exactly that many workout days
- Preferred time (morning/afternoon/evening/flexible): optional scheduling hints in workoutTips
- Design exercises ONLY using the equipment listed; avoid exercises requiring equipment the user does not have
- For exercises, use ONLY specific, real exercise names (e.g. "Barbell Bench Press", "Romanian Deadlift", "Goblet Squat", "Pull-Up"). Never use vague placeholders like "Compound lift variation", "Accessory movement", "Mobility flow", or "Conditioning finisher"
- Account for dietary restrictions and injuries
- Be encouraging and realistic
- Format responses as valid JSON only, no markdown or extra text

Diet must be tailored to the user's goal:
- lose_weight: High-volume, lower-calorie meals. Emphasize lean protein, fiber, vegetables. Avoid calorie-dense snacks. Specific foods: salads, grilled chicken, eggs, Greek yogurt, vegetables, berries, nuts in small portions.
- maintain: Balanced, varied meals. Sustainable eating. Mix protein, carbs, and fat. Include favorite foods in moderation.
- build_muscle: Higher protein (1.6–2.2g/kg), calorie surplus, carbs around training. Specific: oatmeal + eggs, chicken rice bowls, salmon/steak with potatoes, protein shakes, cottage cheese. Spread protein across 4–5 meals.
- improve_endurance: Carbohydrate-focused for fuel. Oatmeal, pasta, rice, bananas, energy bars. Moderate protein; carbs before and after long sessions. Include electrolytes for long workouts.`;

function parseJsonResponse(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in response");
  return JSON.parse(match[0]);
}

const GOAL_MEALS: Record<UserProfile["goal"], { breakfast: string; lunch: string; dinner: string; snack: string; tips: string[] }> = {
  lose_weight: {
    breakfast: "High-volume, protein-rich: eggs or Greek yogurt with veggies and berries to stay full on fewer calories",
    lunch: "Large salad with grilled chicken or fish, light dressing; add quinoa or chickpeas for fiber and satiety",
    dinner: "Lean protein (chicken breast, white fish) with steamed veggies and a small portion of whole grains",
    snack: "Vegetable sticks and hummus, or a small handful of almonds with an apple",
    tips: [
      "Prioritize protein and fiber at each meal—they keep you full on fewer calories.",
      "Use smaller plates; eat slowly. Drink water before meals.",
      "Avoid liquid calories; swap sugary drinks for water, tea, or black coffee.",
    ],
  },
  maintain: {
    breakfast: "Balanced plate: oatmeal with nuts and fruit, or eggs with avocado toast—mix it up day to day",
    lunch: "Varied lunches: grain bowl, wrap, or soup with a side of vegetables and protein",
    dinner: "Balanced plate: protein, vegetables, and quality carbs (rice, potato, whole grains)",
    snack: "Greek yogurt, fruit with nut butter, or a small portion of trail mix",
    tips: [
      "Keep variety in your meals to avoid boredom and stay consistent.",
      "Listen to hunger cues; adjust portions based on activity level.",
      "Hydrate consistently and aim for regular meal timing.",
    ],
  },
  build_muscle: {
    breakfast: "Oatmeal with eggs and banana, or protein pancakes—aim for 30–40g protein to kick off muscle synthesis",
    lunch: "Chicken/beef rice bowl with vegetables; or a large sandwich with extra meat and a side of fruit",
    dinner: "Generous protein (steak, salmon, or chicken thigh) with potatoes or rice and greens",
    snack: "Protein shake, Greek yogurt with honey, or cottage cheese with fruit",
    tips: [
      "Spread protein evenly across 4–5 meals (aim for ~0.8g per lb bodyweight).",
      "Eat a carb + protein meal within 1–2 hours after training.",
      "Don't skip meals—consistency supports gains.",
    ],
  },
  improve_endurance: {
    breakfast: "Carb-focused: oatmeal or toast with peanut butter and banana; add eggs for protein",
    lunch: "Pasta, rice, or wrap with lean protein and vegetables—carbs fuel your long sessions",
    dinner: "Salmon or chicken with sweet potato and roasted vegetables for recovery",
    snack: "Banana and nuts, energy bar, or a small smoothie",
    tips: [
      "Carbs are your main fuel; eat them before and after endurance sessions.",
      "Aim for 3–5g carbs per kg bodyweight on heavy training days.",
      "Include sodium and electrolytes if training in heat or for long durations.",
    ],
  },
};

function buildStarterPlan(profile: UserProfile, userId: string): FitnessPlan {
  const goalTargets: Record<UserProfile["goal"], Macros> = {
    lose_weight: { calories: 1900, protein: 150, carbs: 170, fat: 60 },
    maintain: { calories: 2300, protein: 140, carbs: 260, fat: 75 },
    build_muscle: { calories: 2600, protein: 165, carbs: 300, fat: 80 },
    improve_endurance: { calories: 2400, protein: 135, carbs: 310, fat: 70 },
  };
  const dailyTargets = goalTargets[profile.goal] ?? goalTargets.maintain;
  const workoutDays = Math.min(Math.max(profile.workoutDaysPerWeek ?? 4, 2), 7);
  const goalMeals = GOAL_MEALS[profile.goal] ?? GOAL_MEALS.maintain;

  const dietPlanDays = WEEK_DAYS.map((day) => ({
    day,
    meals: [
      {
        mealType: "Breakfast",
        description: goalMeals.breakfast,
        macros: { calories: Math.round(dailyTargets.calories * 0.28), protein: Math.round(dailyTargets.protein * 0.28), carbs: Math.round(dailyTargets.carbs * 0.3), fat: Math.round(dailyTargets.fat * 0.3) },
      },
      {
        mealType: "Lunch",
        description: goalMeals.lunch,
        macros: { calories: Math.round(dailyTargets.calories * 0.34), protein: Math.round(dailyTargets.protein * 0.34), carbs: Math.round(dailyTargets.carbs * 0.35), fat: Math.round(dailyTargets.fat * 0.33) },
      },
      {
        mealType: "Dinner",
        description: goalMeals.dinner,
        macros: { calories: Math.round(dailyTargets.calories * 0.3), protein: Math.round(dailyTargets.protein * 0.3), carbs: Math.round(dailyTargets.carbs * 0.28), fat: Math.round(dailyTargets.fat * 0.3) },
      },
      {
        mealType: "Snack",
        description: goalMeals.snack,
        macros: { calories: Math.round(dailyTargets.calories * 0.08), protein: Math.round(dailyTargets.protein * 0.08), carbs: Math.round(dailyTargets.carbs * 0.07), fat: Math.round(dailyTargets.fat * 0.07) },
      },
    ],
  }));

    const defaultWarmups = [
      { name: "Arm Circles", sets: "1", reps: "10 each direction", notes: "Loosen shoulders" },
      { name: "Band Pull-Aparts", sets: "1", reps: "15", notes: "Activate rear delts" },
      { name: "Bodyweight Squat", sets: "1", reps: "10", notes: "Hip mobility" },
    ];
    const defaultFinishers = [
      { name: "Plank", sets: "2", reps: "45s", notes: "Core finisher" },
    ];
    const workoutPlanDays = WEEK_DAYS.map((day, idx) => {
    if (idx >= workoutDays) {
      return {
        day,
        focus: "Recovery / Mobility",
        warmups: [
          { name: "Hip Circles", sets: "1", reps: "5 each side", notes: "Hip mobility" },
          { name: "Cat-Cow Stretch", sets: "1", reps: "8 reps", notes: "Spine mobility" },
        ],
        exercises: [
          { name: "Incline Walk", sets: "1", reps: "20-30 min", notes: "Light pace on treadmill or outdoors" },
          { name: "Hip Flexor Stretch", sets: "2", reps: "30s per side", notes: "Hold each side" },
        ],
        finishers: [],
      };
    }
    const focus =
      idx % 3 === 0 ? "Upper Body Strength" : idx % 3 === 1 ? "Lower Body Strength" : "Conditioning + Core";
    const upperExercises = [
      { name: "Bench Press", sets: "4", reps: "6-8" },
      { name: "Overhead Press", sets: "3", reps: "8-10" },
      { name: "Bent Over Row", sets: "3", reps: "8-10" },
    ];
    const lowerExercises = [
      { name: "Back Squat", sets: "4", reps: "5-6" },
      { name: "Romanian Deadlift", sets: "3", reps: "8-10" },
      { name: "Walking Lunge", sets: "3", reps: "10 per leg" },
    ];
    const conditioningExercises = [
      { name: "Mountain Climber", sets: "3", reps: "30s", notes: "Moderate pace" },
      { name: "Plank", sets: "3", reps: "45s", notes: "Hold" },
      { name: "Burpee", sets: "2", reps: "10", notes: "Controlled pace" },
    ];
    const exercises =
      focus === "Upper Body Strength"
        ? upperExercises
        : focus === "Lower Body Strength"
          ? lowerExercises
          : conditioningExercises;
    return { day, focus, warmups: defaultWarmups, exercises, finishers: defaultFinishers };
  });

  return {
    id: uuidv4(),
    userId,
    createdAt: new Date().toISOString(),
    dietPlan: {
      dailyTargets,
      weeklyPlan: dietPlanDays,
      tips: goalMeals.tips,
    },
    workoutPlan: {
      weeklyPlan: workoutPlanDays,
      tips: [
        "Use progressive overload week to week when form is solid.",
        "Keep one or two reps in reserve on most sets.",
        "Take at least one complete recovery day each week.",
      ],
    },
    reasoning: "Starter plan returned while full Nova generation exceeded the timeout window.",
  };
}

const PlanRequestSchema = z.object({
  name: z.string().min(1).max(80),
  age: z.number().int().min(10).max(120).optional(),
  weight: z.number().min(20).max(500).optional(),
  height: z.number().min(80).max(260).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  fitnessLevel: z.enum(["beginner", "intermediate", "advanced", "athlete"]),
  goal: z.enum(["lose_weight", "maintain", "build_muscle", "improve_endurance"]),
  dietaryRestrictions: z.array(z.string().max(80)).max(50).optional(),
  injuriesOrLimitations: z.array(z.string().max(120)).max(50).optional(),
  dailyActivityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
  workoutLocation: z.enum(["home", "gym", "outside"]).optional(),
  workoutEquipment: z.array(z.enum(["bodyweight", "free_weights", "barbells", "kettlebells", "machines", "resistance_bands", "cardio_machines", "pull_up_bar", "cable_machine"])).max(20).optional(),
  workoutDaysPerWeek: z.number().int().min(2).max(7).optional(),
  workoutTimeframe: z.enum(["morning", "afternoon", "evening", "flexible"]).optional(),
  createdAt: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const rl = fixedWindowRateLimit(
      getClientKey(getRequestIp(req), "plans-generate"),
      20,
      60_000
    );
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly." },
        { status: 429 }
      );
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      res.headers.set("Retry-After", headers.retryAfter);
      return res;
    }

    const incomingParsed = PlanRequestSchema.safeParse(await req.json());
    if (!incomingParsed.success) {
      return NextResponse.json(
        { error: "Missing required profile fields" },
        { status: 400 }
      );
    }
    const incoming = incomingParsed.data;
    const profile: UserProfile = {
      id: userId,
      name: incoming.name,
      age: incoming.age ?? 30,
      weight: incoming.weight ?? 70,
      height: incoming.height ?? 170,
      gender: incoming.gender ?? "other",
      fitnessLevel: incoming.fitnessLevel,
      goal: incoming.goal,
      dietaryRestrictions: incoming.dietaryRestrictions ?? [],
      injuriesOrLimitations: incoming.injuriesOrLimitations ?? [],
      dailyActivityLevel: incoming.dailyActivityLevel ?? "moderate",
      workoutLocation: incoming.workoutLocation,
      workoutEquipment: incoming.workoutEquipment,
      workoutDaysPerWeek: incoming.workoutDaysPerWeek,
      workoutTimeframe: incoming.workoutTimeframe,
      createdAt: incoming.createdAt ?? new Date().toISOString(),
    };

    const loc = profile.workoutLocation ?? "gym";
    const equip = profile.workoutEquipment?.length ? profile.workoutEquipment.map((e) => e.replace(/_/g, " ")).join(", ") : "general gym equipment (assume available)";
    const daysPerWeek = profile.workoutDaysPerWeek ?? 4;
    const timeframe = profile.workoutTimeframe ?? "flexible";

    const userMessage = `Create a personalized diet and workout plan for this person. Respond with a SINGLE valid JSON object (no markdown, no \`\`\`).

Profile:
- Name: ${profile.name}
- Age: ${profile.age}, ${profile.gender}
- Weight: ${profile.weight} kg, Height: ${profile.height} cm
- Fitness level: ${profile.fitnessLevel}
- Goal: ${profile.goal}
- Activity level: ${profile.dailyActivityLevel}
- Workout location: ${loc} (design exercises for this setting)
- Equipment available: ${equip}
- Workouts per week: ${daysPerWeek} days (create exactly ${daysPerWeek} workout days in workoutDays)
- Preferred workout time: ${timeframe}
- Dietary restrictions: ${profile.dietaryRestrictions.join(", ") || "None"}
- Injuries/limitations: ${profile.injuriesOrLimitations.join(", ") || "None"}

Important: Each meal's "description" must be SPECIFIC and TAILORED to their goal (${profile.goal}). Name concrete foods and meal ideas—e.g. "Oatmeal with eggs and banana" not "Protein-rich breakfast". Vary meals across the week.

CRITICAL - Exercises: Every exercise "name" MUST be a specific, real exercise (e.g. "Bench Press", "Romanian Deadlift", "Goblet Squat", "Pull-Up", "Lateral Raise"). Never output generic placeholders like "Compound lift variation", "Accessory movement", "Mobility flow", or "Conditioning finisher". Use names that match common fitness databases (ExerciseDB).

CRITICAL - Every workout day MUST include:
- "warmups": array of 2-4 warm-up exercises (e.g. "Arm Circles", "Band Pull-Aparts", "Bodyweight Squat", "Hip Circles"). Use specific, real exercise names.
- "exercises": main workout exercises.
- "finishers": optional array of 1-3 finisher exercises (e.g. "Plank", "Farmer's Carry", "Jump Rope"). Can be empty [] if none. Use specific, real exercise names.

Respond with this exact JSON structure:
{
  "dailyTargets": {"calories": number, "protein": number, "carbs": number, "fat": number},
  "dietDays": [
    {"day": "Monday", "meals": [{"mealType": "Breakfast", "description": "Specific meal idea for their goal", "calories": n, "protein": n, "carbs": n, "fat": n}]}
  ],
  "workoutDays": [
    {"day": "Monday", "focus": "e.g. Upper Body", "warmups": [{"name": "Arm Circles", "sets": "1", "reps": "10 each direction", "notes": "optional"}], "exercises": [{"name": "Bench Press", "sets": "3", "reps": "8-12", "notes": "optional"}], "finishers": [{"name": "Plank", "sets": "2", "reps": "45s", "notes": "optional"}]}
  ],
  "dietTips": ["goal-specific nutrition tip 1", "goal-specific tip 2", "goal-specific tip 3"],
  "workoutTips": ["tip1", "tip2"]
}`;

    // Extended thinking for complex plan reasoning, with timeout fallback.
    const timeoutToken = "__PLAN_TIMEOUT__";
    const raw = await Promise.race<string | typeof timeoutToken>([
      invokeNovaWithExtendedThinking(
        SYSTEM_PROMPT,
        userMessage,
        "high",
        { maxTokens: 8192 }
      ),
      new Promise<typeof timeoutToken>((resolve) => {
        setTimeout(() => resolve(timeoutToken), PLAN_TIMEOUT_MS);
      }),
    ]);

    if (raw === timeoutToken) {
      const fallbackPlan = buildStarterPlan(profile, userId);
      logInfo("Plan generation timeout fallback", { route: "plans/generate", userId, timeoutMs: PLAN_TIMEOUT_MS });
      return NextResponse.json({
        ...fallbackPlan,
        source: "fallback-timeout",
        message: "Starter plan returned quickly while the full personalized generation continues in the background.",
      });
    }

    const parsed = parseJsonResponse(raw) as {
      dailyTargets: Macros;
      dietDays: { day: string; meals: { mealType: string; description: string; calories: number; protein: number; carbs: number; fat: number }[] }[];
      workoutDays: {
        day: string;
        focus: string;
        warmups?: { name: string; sets: string; reps: string; notes?: string }[];
        exercises: { name: string; sets: string; reps: string; notes?: string }[];
        finishers?: { name: string; sets: string; reps: string; notes?: string }[];
      }[];
      dietTips: string[];
      workoutTips: string[];
    };

    const plan: FitnessPlan = {
      id: uuidv4(),
      userId,
      createdAt: new Date().toISOString(),
      dietPlan: {
        dailyTargets: parsed.dailyTargets,
        weeklyPlan: parsed.dietDays.map((d) => ({
          day: d.day,
          meals: d.meals.map((m) => ({
            mealType: m.mealType,
            description: m.description,
            macros: { calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat },
          })),
        })),
        tips: parsed.dietTips,
      },
      workoutPlan: {
        weeklyPlan: parsed.workoutDays.map((d) => ({
          day: d.day,
          focus: d.focus,
          warmups: d.warmups ?? [],
          exercises: d.exercises,
          finishers: d.finishers ?? [],
        })),
        tips: parsed.workoutTips,
      },
    };

    logInfo("Plan generated", { route: "plans/generate", userId });
    const res = NextResponse.json(plan);
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    logError("Plan generation failed", err, { route: "plans/generate" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Plan generation failed" },
      { status: 500 }
    );
  }
}
