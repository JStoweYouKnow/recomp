/**
 * Shared Rico AI chat logic for API routes, Twilio SMS, and Siri Shortcuts.
 */
import { BedrockRuntimeClient, ConverseCommand, type Message, type ToolConfiguration } from "@aws-sdk/client-bedrock-runtime";
import { NOVA_LITE_MODEL_ID } from "@/lib/nova";
import { dbGetMeals, dbGetPlan, dbSaveMeal, dbSavePlan } from "@/lib/db";
import type { MealEntry, FitnessPlan } from "../types";
import { getTodayLocal } from "../date-utils";
import { applyRicoActionsToState, type RicoActionWire } from "../rico-actions";

const REGION = process.env.AWS_REGION ?? "us-east-1";

const RICO_SYSTEM = `You are The Ref, an AI fitness coach for the Refactor app. You're warm, motivating, and genuinely care about the user's progress.

PERSONALITY:
- Supportive and encouraging – celebrate wins, big or small
- Practical – give concrete, actionable advice
- Occasionally stern when needed – if the user has been slacking (missed logs, broken streaks, excuses), give a firm but caring wake-up call. Don't be mean, but don't enable avoidance either.
- Use their name when you know it
- Keep responses concise (2-4 sentences usually). Be punchy.
- Never lecture. Be conversational.

CONTEXT YOU RECEIVE (JSON fields in the [Context: ...] prefix):
- name: user's first name – always use it when it's available
- goal: "lose_weight" | "build_muscle" | "maintain" | "improve_endurance"
- streak: consecutive days with meals logged
- mealsLogged: number of meals logged today
- xp: total experience points earned
- workoutPlan.weeklyPlan: their current workout schedule with exercises, sets, reps
- equipment: list of available equipment (e.g. "free_weights", "machines", "bodyweight", "cable_machine")
- injuries: list of physical limitations (e.g. "lower back pain", "knee injury") – CRITICAL: never recommend exercises that stress these areas
- dietaryRestrictions: list (e.g. "vegetarian", "gluten-free", "dairy-free") – always respect when logging meals or making food suggestions

You have access to tools! You are an AGENT, not just a chatbot.
1. If the user asks to change their calorie or macro targets, use the 'update_macros' tool.
2. If the user says they ate/had/consumed a food or meal (e.g. "I had a chicken salad", "I ate a burrito", "log my lunch: grilled salmon"), ALWAYS use the 'log_meal' tool. Estimate accurate macros based on the food. Do not ask for confirmation—log it immediately.
3. If the user asks to swap/replace an exercise (e.g. "swap bench press for dumbbell press", "replace squats with leg press", "I can't do pull-ups, give me an alternative"), use the 'swap_exercise' tool. Pick the correct day from their plan context. ALWAYS check context.injuries and context.equipment before choosing a replacement—only suggest exercises the user can actually do.
4. If the user asks to add an exercise to a workout day (e.g. "add face pulls to my upper body day", "throw in some calf raises on leg day"), use the 'add_exercise' tool.
5. If the user asks to change a whole workout day's focus, restructure it, or remove exercises (e.g. "make Monday a push day", "remove all finishers from Tuesday", "change Wednesday to cardio only"), use the 'update_workout_day' tool.
6. If the user asks to build a brand-new workout program from scratch, regenerate their full training plan, start over with a new split, or rebuild their meal and workout plan entirely, use the 'regenerate_plan' tool. Use this for full program rebuilds — not for small edits to one day (use update_workout_day, swap_exercise, or add_exercise instead). When they specify a duration (e.g. "12-week program", "8 week plan") set programWeeks (1–12). When they specify frequency (e.g. "4 days per week") set workoutDaysPerWeek (2–7).
7. If the user asks what to cook, which saved recipe fits their macros, or wants dinner ideas from their recipe library, use the 'suggest_recipes' tool. Pass mealType when they mention breakfast/lunch/dinner/snack.
8. If the user shares a recipe URL to save (or asks to save a recipe link), use the 'save_recipe_from_url' tool with the URL.
9. If the user asks to change when their imported or multi-week program starts (e.g. "start my program next Monday", "push week 1 to June 20"), use the 'adjust_program_start' tool with startDate as YYYY-MM-DD (any day in the week they want as program week 1).
Always confirm to the user what you just did when using a tool (e.g. "I've logged your chicken salad!", "Swapped Bench Press for Dumbbell Press on Monday!").

MACRO ESTIMATION GUIDELINES (for log_meal – accuracy matters, be realistic not generous):
Common references: chicken breast 6oz ≈ 280 cal/50p/0c/6f | ground beef 4oz 80/20 ≈ 290 cal/22p/0c/22f | white rice 1 cup cooked ≈ 205 cal/4p/45c/0f | pasta 1 cup cooked ≈ 220 cal/8p/43c/1f | eggs 2 large ≈ 140 cal/12p/1c/10f | banana ≈ 105 cal/1p/27c/0f | avocado half ≈ 120 cal/1p/6c/11f | olive oil 1 tbsp ≈ 120 cal/0p/0c/14f | greek yogurt 6oz non-fat ≈ 100 cal/17p/6c/0f | protein shake 1 scoop ≈ 120 cal/25p/3c/2f
Adjust for stated size: "small" ×0.7, "large" ×1.35. Add ~150 cal for creamy sauces/dressings, ~75 cal for vinaigrette. Restaurant meals often run 20-30% higher than home cooking. When in doubt, estimate the realistic upper bound – under-counting is a common mistake.

GOAL-SPECIFIC COACHING:
- lose_weight: emphasize hitting protein targets, managing calorie awareness, celebrate non-scale victories
- build_muscle: push protein hard, encourage progressive overload and recovery, celebrate strength gains
- maintain: focus on consistency and balance, flag any significant drift in either direction
- improve_endurance: prioritize carb timing around workouts, cardio consistency, and recovery metrics

Respond as The Ref. No markdown. No bullet lists unless it's 2-3 quick tips. Be human.`;

const PERSONA_PROMPTS: Record<string, string> = {
  motivator: `\n\nSTYLE OVERRIDE: You are in HYPE MODE. Be extremely enthusiastic! Use exclamations! Celebrate EVERYTHING! Every meal logged is a WIN. Every macro hit is LEGENDARY. Pump the user up like they just scored the winning touchdown. Energy should be 11/10.`,
  scientist: `\n\nSTYLE OVERRIDE: You are in DATA MODE. Be analytical and precise. Reference research when relevant. Use numbers, percentages, and specific measurements. Say things like "Studies show..." and "Based on your data..." Be the nerdy coach who backs everything with evidence. Still be personable, not robotic.`,
  tough_love: `\n\nSTYLE OVERRIDE: You are in DRILL SERGEANT MODE. No excuses. Be direct, blunt, and unapologetically honest. If they missed a meal, call it out. If they're making excuses, shut it down. Short sentences. Commanding. Think tough love from someone who genuinely cares but won't coddle. Never be cruel, just relentlessly honest.`,
  chill_friend: `\n\nSTYLE OVERRIDE: You are in CHILL MODE. Be relaxed, casual, and laid-back. Use conversational slang. Keep it light and breezy. You're the friend who happens to know about fitness. Say things like "no worries", "you got this", "honestly not a big deal". Never stress the user out. Vibe check: immaculate.`,
};

function getHolidayContext(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (month === 1 && day === 1) return "\n\n[It's New Year's Day! Be extra motivating about fresh starts and new goals.]";
  if (month === 2 && day === 14) return "\n\n[It's Valentine's Day! Work in some self-love and body-positivity messaging.]";
  if (month === 4 && day === 1) return "\n\n[It's April Fools! Be extra playful and witty. Sneak in one fitness joke.]";
  if (month === 10 && day === 31) return "\n\n[It's Halloween! Be spooky-fun. Maybe warn about candy macros with humor.]";
  if (month === 11 && day >= 22 && day <= 28) return "\n\n[It's Thanksgiving week! Acknowledge that holiday eating is normal. No guilt trips.]";
  if (month === 12 && day >= 24 && day <= 26) return "\n\n[It's the holidays! Be festive and encouraging. Rest days are earned.]";
  return "";
}

const RICO_TOOLS: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: "update_macros",
        description: "Updates the user's daily macronutrient targets based on their goals.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              calories: { type: "number", description: "Daily calorie target" },
              protein: { type: "number", description: "Daily protein target in grams" },
              carbs: { type: "number", description: "Daily carbs target in grams" },
              fat: { type: "number", description: "Daily fat target in grams" },
            },
            required: ["calories", "protein", "carbs", "fat"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "log_meal",
        description: "Logs a food item or meal directly into the user's food diary.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              name: { type: "string", description: "Name of the meal/food" },
              mealType: {
                type: "string",
                enum: ["breakfast", "lunch", "dinner", "snack"],
                description: "Meal slot when obvious from user text; defaults to snack",
              },
              calories: { type: "number" },
              protein: { type: "number" },
              carbs: { type: "number" },
              fat: { type: "number" },
            },
            required: ["name", "calories", "protein", "carbs", "fat"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "swap_exercise",
        description: "Replaces one exercise with another in the user's workout plan. Use when the user wants to swap, replace, or substitute an exercise.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              day: { type: "string", description: "Day of the week (e.g. 'Monday', 'Tuesday')" },
              oldExerciseName: { type: "string", description: "Name of the exercise to replace (case-insensitive match)" },
              newExerciseName: { type: "string", description: "Name of the replacement exercise" },
              newSets: { type: "string", description: "Sets for the new exercise (e.g. '3', '4')" },
              newReps: { type: "string", description: "Reps for the new exercise (e.g. '8-12', '10')" },
              newNotes: { type: "string", description: "Optional coaching notes for the new exercise" },
              section: { type: "string", description: "Which section: 'warmups', 'exercises', or 'finishers'. Defaults to 'exercises'." },
            },
            required: ["day", "oldExerciseName", "newExerciseName", "newSets", "newReps"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "add_exercise",
        description: "Adds a new exercise to a specific workout day. Use when the user wants to add an exercise to their plan.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              day: { type: "string", description: "Day of the week (e.g. 'Monday', 'Tuesday')" },
              exerciseName: { type: "string", description: "Name of the exercise to add" },
              sets: { type: "string", description: "Number of sets (e.g. '3', '4')" },
              reps: { type: "string", description: "Reps or duration (e.g. '8-12', '30s', '10 per leg')" },
              notes: { type: "string", description: "Optional coaching notes" },
              section: { type: "string", description: "Where to add: 'warmups', 'exercises', or 'finishers'. Defaults to 'exercises'." },
            },
            required: ["day", "exerciseName", "sets", "reps"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "update_workout_day",
        description: "Restructures an entire workout day — change the focus, replace all exercises, or remove specific sections. Use for bigger changes like 'make Monday a push day' or 'change Thursday to cardio'.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              day: { type: "string", description: "Day of the week (e.g. 'Monday')" },
              focus: { type: "string", description: "New focus label (e.g. 'Push Day', 'Cardio + Core', 'Upper Body Hypertrophy')" },
              warmups: {
                type: "array",
                description: "New warm-up exercises (omit to keep existing)",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sets: { type: "string" },
                    reps: { type: "string" },
                    notes: { type: "string" },
                  },
                  required: ["name", "sets", "reps"],
                },
              },
              exercises: {
                type: "array",
                description: "New main exercises (omit to keep existing)",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sets: { type: "string" },
                    reps: { type: "string" },
                    notes: { type: "string" },
                  },
                  required: ["name", "sets", "reps"],
                },
              },
              finishers: {
                type: "array",
                description: "New finisher exercises (omit to keep existing, use empty [] to remove all finishers)",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sets: { type: "string" },
                    reps: { type: "string" },
                    notes: { type: "string" },
                  },
                  required: ["name", "sets", "reps"],
                },
              },
            },
            required: ["day", "focus"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "regenerate_plan",
        description:
          "Triggers a full AI regeneration of the user's diet and workout plan from their profile. Use when they want a brand-new program, complete workout rebuild, or fresh training split — not for editing a single day.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                description: "Brief summary of why they want a new plan (e.g. 'switching to 4-day upper/lower', 'bored with current program')",
              },
              programWeeks: {
                type: "number",
                description: "Total program length in weeks (1–12). Use when user asks for a multi-week block (e.g. 8-week hypertrophy, 12-week strength). Default 1.",
              },
              workoutDaysPerWeek: {
                type: "number",
                description: "Training days per week (2–7). Use when user specifies frequency (e.g. '4-day split'). Omit to keep profile default.",
              },
            },
          },
        },
      },
    },
    {
      toolSpec: {
        name: "suggest_recipes",
        description:
          "Ranks the user's saved recipes (and curated picks) against today's remaining macros. Use when they ask what to cook or which saved recipe fits their goals.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              mealType: {
                type: "string",
                description: "breakfast, lunch, dinner, or snack — when the user specifies a meal slot",
              },
              query: {
                type: "string",
                description: "Optional search hint (e.g. 'chicken', 'quick', 'high protein')",
              },
              includeDiscover: {
                type: "boolean",
                description: "Whether to include third-party recipe discovery (default true)",
              },
            },
          },
        },
      },
    },
    {
      toolSpec: {
        name: "save_recipe_from_url",
        description: "Parses a recipe URL and saves it to the user's synced recipe library.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              url: { type: "string", description: "Full http(s) recipe URL" },
            },
            required: ["url"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "adjust_program_start",
        description:
          "Sets program week 1 to start on a specific calendar week. Use when the user wants to shift an imported or multi-week workout plan to a different Monday/week anchor.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              startDate: {
                type: "string",
                description: "Any date (YYYY-MM-DD) in the week that should become program week 1",
              },
            },
            required: ["startDate"],
          },
        },
      },
    },
  ],
};

export interface RicoContext {
  name?: string;
  streak?: number;
  mealsLogged?: number;
  xp?: number;
  goal?: string;
  recentMilestones?: string[];
  biofeedbackSummary?: string | null;
  hydrationSummary?: string | null;
  activeFast?: string | null;
  /** Today's logged meals so Rico knows what the user has eaten. */
  recentMeals?: { name: string; calories: number; protein: number; carbs: number; fat: number; mealType: string }[];
  /** Running macro totals for today. */
  todayMacros?: { calories: number; protein: number; carbs: number; fat: number };
  /** Daily targets from the user's plan. */
  macroTargets?: { calories: number; protein: number; carbs: number; fat: number };
  /** Latest body weight in lbs. */
  bodyWeight?: number;
  workoutPlan?: {
    weeklyPlan: {
      day: string;
      focus: string;
      warmups?: { name: string; sets: string; reps: string; notes?: string }[];
      exercises: { name: string; sets: string; reps: string; notes?: string }[];
      finishers?: { name: string; sets: string; reps: string; notes?: string }[];
    }[];
  } | null;
  equipment?: string[];
  injuries?: string[];
  dietaryRestrictions?: string[];
  /** Count of synced saved recipes */
  savedRecipeCount?: number;
  /** Preview of saved recipe names for context */
  savedRecipeNames?: string[];
  /** Remaining macros today (targets minus logged) */
  remainingMacros?: { calories: number; protein: number; carbs: number; fat: number };
  /** Saved recipes for server-side ranking (cap ~30 in client) */
  savedRecipes?: { id: string; name: string; calories: number; protein: number; carbs: number; fat: number; recipeUrl?: string; source?: string }[];
}

export interface RicoHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RicoInput {
  message: string;
  history?: RicoHistoryMessage[];
  context?: RicoContext;
  persona?: string;
}

export interface RicoOutput {
  reply: string;
  actions: { type: string; payload: Record<string, unknown> }[];
}

/** Invoke Rico and return reply text + optional tool actions. */
export async function invokeRico(input: RicoInput): Promise<RicoOutput> {
  const { message, history = [], context = {}, persona } = input;
  const msg = typeof message === "string" ? message.trim() : "";
  if (!msg) throw new Error("Message required");

  let systemPrompt = RICO_SYSTEM;
  if (Object.keys(context).length > 0) {
    systemPrompt += `\n\n[USER CONTEXT: ${JSON.stringify(context)}]`;
  }
  if (persona && PERSONA_PROMPTS[persona]) {
    systemPrompt += PERSONA_PROMPTS[persona];
  }
  systemPrompt += getHolidayContext();

  const client = new BedrockRuntimeClient({ region: REGION });

  // Build multi-turn conversation from history (last 12 entries = ~6 turns).
  // The iOS client includes the current user message as the last history entry,
  // so we drop it to avoid duplication before appending it as the final turn.
  const trimmed = history
    .filter((h) => h.role === "user" || h.role === "assistant")
    .slice(-41) // keep at most 41 so after dropping the last we have 40 (20 turns)
    .slice(0, -1); // drop the last entry (current user message sent by client)

  // Bedrock requires strictly alternating user/assistant turns.
  // Collapse any consecutive same-role messages by joining their content.
  const alternating: Message[] = [];
  for (const h of trimmed) {
    const last = alternating[alternating.length - 1];
    if (last && last.role === h.role) {
      (last.content as { text: string }[])[0].text += "\n" + h.content;
    } else {
      alternating.push({ role: h.role as "user" | "assistant", content: [{ text: h.content }] });
    }
  }

  // Ensure history starts with a user turn (Bedrock requirement).
  if (alternating.length > 0 && alternating[0].role !== "user") {
    alternating.shift();
  }

  const messages: Message[] = [...alternating, { role: "user", content: [{ text: msg }] }];

  const response = await client.send(
    new ConverseCommand({
      modelId: NOVA_LITE_MODEL_ID,
      messages,
      system: [{ text: systemPrompt }],
      toolConfig: RICO_TOOLS,
      inferenceConfig: { temperature: 0.7, maxTokens: 1024, topP: 0.9 },
    })
  );

  const output = response.output?.message;
  if (!output || !output.content) throw new Error("Empty response from Bedrock");

  let replyText = "";
  const actions: { type: string; payload: Record<string, unknown> }[] = [];

  for (const block of output.content) {
    const b = block as { text?: string; toolUse?: { name: string; input: Record<string, unknown> } };
    if (b.text) replyText += b.text;
    if (b.toolUse) actions.push({ type: b.toolUse.name, payload: b.toolUse.input });
  }

  if (!replyText && actions.length > 0) {
    const a = actions[0];
    if (a.type === "update_macros") replyText = "I've updated your daily targets!";
    else if (a.type === "log_meal") replyText = `I've logged ${(a.payload as { name?: string }).name ?? "your meal"} for you.`;
    else if (a.type === "swap_exercise") replyText = `Done! Swapped ${(a.payload as { oldExerciseName?: string }).oldExerciseName ?? "that exercise"} for ${(a.payload as { newExerciseName?: string }).newExerciseName ?? "the new one"}.`;
    else if (a.type === "add_exercise") replyText = `Added ${(a.payload as { exerciseName?: string }).exerciseName ?? "the exercise"} to your ${(a.payload as { day?: string }).day ?? ""} workout!`;
    else if (a.type === "update_workout_day") replyText = `Updated your ${(a.payload as { day?: string }).day ?? ""} workout to ${(a.payload as { focus?: string }).focus ?? "the new focus"}!`;
    else if (a.type === "regenerate_plan") {
      const weeks = (a.payload as { programWeeks?: number }).programWeeks;
      replyText =
        weeks && weeks > 1
          ? `On it — I'm building your ${weeks}-week program week by week. This may take a few minutes.`
          : "On it — I'm building you a fresh workout and meal plan. This can take up to a minute.";
    } else if (a.type === "suggest_recipes") {
      replyText = "Here are recipes that fit your remaining macros today:";
    } else if (a.type === "save_recipe_from_url") {
      replyText = "Saved that recipe to your library!";
    } else if (a.type === "adjust_program_start") {
      replyText = `Program week 1 now starts the week of ${(a.payload as { startDate?: string }).startDate ?? "that date"}.`;
    }
  }

  return { reply: replyText.trim(), actions };
}

/**
 * Persist Rico actions for headless surfaces (SMS, Siri Shortcuts).
 * Applies meals and macro targets server-side; workout edits require the app.
 */
export async function persistHeadlessRicoActions(
  userId: string,
  actions: RicoOutput["actions"]
): Promise<{ replySuffix: string }> {
  if (actions.length === 0) return { replySuffix: "" };

  const meals = await dbGetMeals(userId);
  const plan = await dbGetPlan(userId);
  const mealCountBefore = meals.length;
  const wireActions: RicoActionWire[] = actions.map((a) => ({
    type: a.type,
    payload: a.payload as Record<string, unknown>,
  }));
  const state = {
    meals: [...meals],
    plan: plan ? structuredClone(plan) : null,
  };
  const result = applyRicoActionsToState(wireActions, state);

  if (result.touchedMeals) {
    for (const meal of state.meals.slice(mealCountBefore)) {
      await dbSaveMeal(userId, meal);
    }
  }
  if (result.touchedPlan && state.plan) {
    await dbSavePlan(userId, state.plan);
  }

  const appOnly = result.skipped
    .filter((s) =>
      ["swap_exercise", "add_exercise", "update_workout_day", "regenerate_plan", "adjust_program_start"].includes(
        s.type,
      ),
    )
    .map((s) => s.type);

  let replySuffix = "";
  if (appOnly.length > 0) {
    replySuffix = `\n\nOpen the Refactor app to apply: ${Array.from(new Set(appOnly)).join(", ")}.`;
  }
  return { replySuffix };
}

/** @deprecated Use persistHeadlessRicoActions */
export async function persistLogMealActions(
  userId: string,
  actions: RicoOutput["actions"]
): Promise<void> {
  await persistHeadlessRicoActions(userId, actions);
}

/** Build minimal context from server-side data for SMS / Shortcuts (no localStorage). */
export function buildRicoContextFromServer(data: {
  meals?: MealEntry[];
  plan?: FitnessPlan | null;
  profile?: { name?: string; goal?: string };
  meta?: { xp?: number; ricoHistory?: { role: string }[] };
}): RicoContext {
  const meals = data.meals ?? [];
  const dates = new Set(meals.map((m) => m.date));
  const today = getTodayLocal();
  let streak = 0;
  if (dates.has(today)) {
    const sorted = Array.from(dates).sort().reverse();
    let prev: number | null = null;
    for (const d of sorted) {
      const t = new Date(d).getTime();
      if (prev === null || prev - t === 86400000) streak++;
      else break;
      prev = t;
    }
  }

  return {
    streak,
    mealsLogged: meals.length,
    xp: data.meta?.xp,
    goal: data.profile?.goal,
  };
}
