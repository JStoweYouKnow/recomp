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

const SYSTEM_PROMPT = `You are an expert fitness and nutrition coach powered by Amazon Nova AI. Your role is to create personalized, safe, and effective diet and workout plans.

Guidelines:
- Use evidence-based nutrition and exercise science
- Adapt plans to fitness level: beginner (minimal experience), intermediate (6+ months), advanced (2+ years), athlete (competitive)
- Goals: lose_weight (calorie deficit), maintain (balance), build_muscle (surplus + protein), improve_endurance (cardio focus)
- Workout location: home (minimal space, limited equipment), gym (full access), outside (parks, running, bodyweight, portable)
- Workout frequency: respect workoutDaysPerWeek (2–7); create exactly that many workout days
- Preferred time (morning/afternoon/evening/flexible): optional scheduling hints in workoutTips
- Design exercises ONLY using the equipment listed; avoid exercises requiring equipment the user does not have
- Account for dietary restrictions and injuries
- Be encouraging and realistic
- Format responses as valid JSON only, no markdown or extra text`;

function parseJsonResponse(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in response");
  return JSON.parse(match[0]);
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

Respond with this exact JSON structure:
{
  "dailyTargets": {"calories": number, "protein": number, "carbs": number, "fat": number},
  "dietDays": [
    {"day": "Monday", "meals": [{"mealType": "Breakfast", "description": "...", "calories": n, "protein": n, "carbs": n, "fat": n}]}
  ],
  "workoutDays": [
    {"day": "Monday", "focus": "e.g. Upper Body", "exercises": [{"name": "...", "sets": "3", "reps": "8-12", "notes": "optional"}]}
  ],
  "dietTips": ["tip1", "tip2"],
  "workoutTips": ["tip1", "tip2"]
}`;

    // Extended thinking for complex plan reasoning
    const raw = await invokeNovaWithExtendedThinking(
      SYSTEM_PROMPT,
      userMessage,
      "high",
      { maxTokens: 8192 }
    );

    const parsed = parseJsonResponse(raw) as {
      dailyTargets: Macros;
      dietDays: { day: string; meals: { mealType: string; description: string; calories: number; protein: number; carbs: number; fat: number }[] }[];
      workoutDays: { day: string; focus: string; exercises: { name: string; sets: string; reps: string; notes?: string }[] }[];
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
          exercises: d.exercises,
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
