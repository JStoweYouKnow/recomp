import { NextRequest, NextResponse } from "next/server";
import { invokeNovaWithExtendedThinking } from "@/lib/nova";
import { logError, logInfo, withRequestLogging } from "@/lib/logger";
import { getUserId } from "@/lib/auth";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { clampProgramWeeks, clampWorkoutDaysPerWeek, MAX_PROGRAM_WEEKS } from "@/lib/multi-week-plan";
import type { WorkoutDay } from "@/lib/types";
import { z } from "zod";

export const maxDuration = 60;
const CHUNK_TIMEOUT_MS = 55_000;
const MAX_WEEKS_PER_REQUEST = 3;

const ExerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.union([z.string(), z.number()]).transform(String),
  reps: z.union([z.string(), z.number()]).transform(String),
  notes: z.union([z.string(), z.undefined()]).optional(),
});

const WorkoutDaySchema = z.object({
  day: z.string().min(1),
  focus: z.string().default("Workout"),
  warmups: z.array(ExerciseSchema).optional().default([]),
  exercises: z.array(ExerciseSchema).min(1),
  finishers: z.array(ExerciseSchema).optional().default([]),
});

const RequestSchema = z.object({
  fromWeek: z.number().int().min(2).max(MAX_PROGRAM_WEEKS),
  toWeek: z.number().int().min(2).max(MAX_PROGRAM_WEEKS),
  programWeeks: z.number().int().min(2).max(MAX_PROGRAM_WEEKS),
  workoutDaysPerWeek: z.number().int().min(2).max(7),
  week1Template: z.array(WorkoutDaySchema).min(1).max(7),
  reason: z.string().max(300).optional(),
  profile: z.object({
    name: z.string().min(1).max(80),
    goal: z.enum(["lose_weight", "maintain", "build_muscle", "improve_endurance"]),
    fitnessLevel: z.enum(["beginner", "intermediate", "advanced", "athlete"]),
    workoutLocation: z.enum(["home", "gym", "outside"]).optional(),
    workoutEquipment: z.array(z.string().max(40)).max(20).optional(),
    injuriesOrLimitations: z.array(z.string().max(120)).max(50).optional(),
    workoutDaysPerWeek: z.number().int().min(2).max(7),
  }),
});

function extractJsonObject(text: string): string {
  let s = text.replace(/^[\s\S]*?```(?:json)?\s*\n?/i, "").replace(/\n?```[\s\S]*$/i, "").trim();
  const start = s.indexOf("{");
  if (start < 0) throw new Error("No JSON object found");
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = "";
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new Error("Unbalanced braces in JSON");
}

function parseWorkoutChunkJson(raw: string): WorkoutDay[] {
  const extracted = extractJsonObject(raw).replace(/,(\s*[}\]])/g, "$1");
  const parsed = JSON.parse(extracted) as { workoutDays?: unknown };
  const result = z.object({ workoutDays: z.array(WorkoutDaySchema).min(1) }).safeParse(parsed);
  if (!result.success) throw new Error(result.error.message);
  return result.data.workoutDays;
}

export const POST = withRequestLogging("/api/plans/generate-workouts", async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const rl = await fixedWindowRateLimit(
      getClientKey(getRequestIp(req), "plans-generate-workouts"),
      30,
      60_000
    );
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
    }

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const body = parsed.data;
    if (body.fromWeek > body.toWeek) {
      return NextResponse.json({ error: "fromWeek must be <= toWeek" }, { status: 400 });
    }
    if (body.toWeek - body.fromWeek + 1 > MAX_WEEKS_PER_REQUEST) {
      return NextResponse.json({ error: `At most ${MAX_WEEKS_PER_REQUEST} weeks per request` }, { status: 400 });
    }
    if (body.toWeek > body.programWeeks) {
      return NextResponse.json({ error: "toWeek exceeds programWeeks" }, { status: 400 });
    }

    const totalWeeks = clampProgramWeeks(body.programWeeks);
    const daysPerWeek = clampWorkoutDaysPerWeek(body.workoutDaysPerWeek);
    const loc = body.profile.workoutLocation ?? "gym";
    const equip = body.profile.workoutEquipment?.length
      ? body.profile.workoutEquipment.join(", ")
      : "general gym equipment";

    const userMessage = `Generate workout days for weeks ${body.fromWeek} through ${body.toWeek} of a ${totalWeeks}-week training program.

Athlete profile:
- Name: ${body.profile.name}
- Goal: ${body.profile.goal}
- Fitness level: ${body.profile.fitnessLevel}
- Location: ${loc}
- Equipment: ${equip}
- Training days per week: ${daysPerWeek}
- Injuries/limitations: ${body.profile.injuriesOrLimitations?.join(", ") || "None"}
${body.reason ? `- Program intent: ${body.reason}` : ""}

Week 1 template (same weekly split — vary exercises and progressive overload week to week):
${JSON.stringify(body.week1Template, null, 2)}

Rules:
- Output exactly ${daysPerWeek} workout sessions for EACH week from ${body.fromWeek} to ${body.toWeek}.
- Each "day" label MUST be "Weekday — Week N" (e.g. "Monday — Week 3", "Wednesday — Week 4").
- Use specific real exercise names only (Bench Press, Romanian Deadlift, etc.).
- Apply progressive overload: slightly increase sets, reps, or intensity vs earlier weeks.
- Include warmups (2-4) and optional finishers per session.
- Respect equipment and injuries.

Reply with ONLY valid JSON:
{
  "workoutDays": [
    {"day": "Monday — Week ${body.fromWeek}", "focus": "...", "warmups": [...], "exercises": [...], "finishers": [...]}
  ]
}`;

    const timeoutToken = "__TIMEOUT__";
    const raw = await Promise.race<string | typeof timeoutToken>([
      invokeNovaWithExtendedThinking(
        "You are an expert strength coach. Return only valid JSON workout programs with specific exercise names.",
        userMessage,
        "medium",
        { maxTokens: 6144, temperature: 0.35 }
      ),
      new Promise<typeof timeoutToken>((resolve) => {
        setTimeout(() => resolve(timeoutToken), CHUNK_TIMEOUT_MS);
      }),
    ]);

    if (raw === timeoutToken) {
      return NextResponse.json({ error: "Workout generation timed out. Try again." }, { status: 504 });
    }

    let workoutDays: WorkoutDay[];
    try {
      workoutDays = parseWorkoutChunkJson(raw);
    } catch (parseErr) {
      logError("Workout chunk JSON parse failed", parseErr, {
        route: "plans/generate-workouts",
        userId,
        fromWeek: body.fromWeek,
        toWeek: body.toWeek,
      });
      return NextResponse.json({ error: "Could not parse workout program from AI response." }, { status: 502 });
    }

    logInfo("Workout weeks generated", {
      route: "plans/generate-workouts",
      userId,
      fromWeek: body.fromWeek,
      toWeek: body.toWeek,
      days: workoutDays.length,
    });

    const res = NextResponse.json({ workoutDays });
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    logError("Workout week generation failed", err, { route: "plans/generate-workouts" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Workout generation failed" },
      { status: 500 }
    );
  }
});
