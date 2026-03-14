/**
 * Shared Rico AI chat logic for API routes, Twilio SMS, and Siri Shortcuts.
 */
import { BedrockRuntimeClient, ConverseCommand, type Message, type ToolConfiguration } from "@aws-sdk/client-bedrock-runtime";
import { NOVA_LITE_MODEL_ID } from "@/lib/nova";
import type { MealEntry, FitnessPlan, Macros } from "../types";
import { getTodayLocal } from "../date-utils";

const REGION = process.env.AWS_REGION ?? "us-east-1";

const RICO_SYSTEM = `You are The Ref, an AI fitness coach for the Refactor app. You're warm, motivating, and genuinely care about the user's progress.

PERSONALITY:
- Supportive and encouraging – celebrate wins, big or small
- Practical – give concrete, actionable advice
- Occasionally stern when needed – if the user has been slacking (missed logs, broken streaks, excuses), give a firm but caring wake-up call. Don't be mean, but don't enable avoidance either.
- Use their name when you know it
- Keep responses concise (2-4 sentences usually). Be punchy.
- Never lecture. Be conversational.

CONTEXT YOU RECEIVE:
The user's message plus optional context about: streak length, meals logged, XP, recent milestones, goal, current macros, whether they've been inconsistent lately, and their current workout plan (days, exercises, sets, reps).

You have access to tools! You are an AGENT, not just a chatbot.
1. If the user asks to change their calorie or macro targets, use the 'update_macros' tool.
2. If the user says they ate/had/consumed a food or meal (e.g. "I had a chicken salad", "I ate a burrito", "log my lunch: grilled salmon"), ALWAYS use the 'log_meal' tool. Estimate reasonable macros based on the food. Do not ask for confirmation—log it immediately.
3. If the user asks to swap/replace an exercise (e.g. "swap bench press for dumbbell press", "replace squats with leg press", "I can't do pull-ups, give me an alternative"), use the 'swap_exercise' tool. Pick the correct day from their plan context.
4. If the user asks to add an exercise to a workout day (e.g. "add face pulls to my upper body day", "throw in some calf raises on leg day"), use the 'add_exercise' tool.
5. If the user asks to change a whole workout day's focus, restructure it, or remove exercises (e.g. "make Monday a push day", "remove all finishers from Tuesday", "change Wednesday to cardio only"), use the 'update_workout_day' tool.
Always confirm to the user what you just did when using a tool (e.g. "I've logged your chicken salad!", "Swapped Bench Press for Dumbbell Press on Monday!").

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
  ],
};

export interface RicoContext {
  streak?: number;
  mealsLogged?: number;
  xp?: number;
  goal?: string;
  recentMilestones?: string[];
  biofeedbackSummary?: string | null;
  hydrationSummary?: string | null;
  activeFast?: string | null;
  workoutPlan?: {
    weeklyPlan: {
      day: string;
      focus: string;
      warmups?: { name: string; sets: string; reps: string; notes?: string }[];
      exercises: { name: string; sets: string; reps: string; notes?: string }[];
      finishers?: { name: string; sets: string; reps: string; notes?: string }[];
    }[];
  } | null;
}

export interface RicoInput {
  message: string;
  context?: RicoContext;
  persona?: string;
}

export interface RicoOutput {
  reply: string;
  actions: { type: string; payload: Record<string, unknown> }[];
}

/** Invoke Rico and return reply text + optional tool actions. */
export async function invokeRico(input: RicoInput): Promise<RicoOutput> {
  const { message, context = {}, persona } = input;
  const msg = typeof message === "string" ? message.trim() : "";
  if (!msg) throw new Error("Message required");

  const userPrompt = `[Context: ${JSON.stringify(context)}]\n\nUser: ${msg}`;

  let systemPrompt = RICO_SYSTEM;
  if (persona && PERSONA_PROMPTS[persona]) {
    systemPrompt += PERSONA_PROMPTS[persona];
  }
  systemPrompt += getHolidayContext();

  const client = new BedrockRuntimeClient({ region: REGION });
  const messages: Message[] = [{ role: "user", content: [{ text: userPrompt }] }];

  const response = await client.send(
    new ConverseCommand({
      modelId: NOVA_LITE_MODEL_ID,
      messages,
      system: [{ text: systemPrompt }],
      toolConfig: RICO_TOOLS,
      inferenceConfig: { temperature: 0.7, maxTokens: 512, topP: 0.9 },
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
  }

  return { reply: replyText.trim(), actions };
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
