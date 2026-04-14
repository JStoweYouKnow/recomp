import type { WorkoutDay, WorkoutExercise } from "@/lib/types";

function normalizeExerciseList(
  list: Array<{ name?: string; sets?: string; reps?: string; notes?: string }> | undefined
): WorkoutExercise[] {
  return (list ?? [])
    .filter((e): e is { name: string; sets?: string; reps?: string; notes?: string } =>
      Boolean(e && typeof e.name === "string" && e.name.trim().length > 0)
    )
    .map((e) => ({
      name: String(e.name).trim(),
      sets: String(e.sets ?? "3").trim() || "3",
      reps: String(e.reps ?? "10").trim() || "10",
      notes: e.notes ? String(e.notes).trim() : undefined,
    }));
}

function normalizeWorkoutDayFromParsed(parsed: {
  day?: string;
  focus?: string;
  warmups?: Array<{ name?: string; sets?: string; reps?: string; notes?: string }>;
  exercises?: Array<{ name?: string; sets?: string; reps?: string; notes?: string }>;
  finishers?: Array<{ name?: string; sets?: string; reps?: string; notes?: string }>;
}): WorkoutDay | null {
  const exercises = normalizeExerciseList(parsed.exercises);
  if (exercises.length === 0) return null;
  const warmups = normalizeExerciseList(parsed.warmups);
  const finishers = normalizeExerciseList(parsed.finishers);
  return {
    day: String(parsed.day ?? "Imported").trim() || "Imported",
    focus: String(parsed.focus ?? "Imported workout").trim() || "Imported workout",
    ...(warmups.length ? { warmups } : {}),
    exercises,
    ...(finishers.length ? { finishers } : {}),
  };
}

export const WORKOUT_JSON_SYSTEM = `You extract workout exercises from web pages, PDFs, or program text. Return ONLY valid JSON, no markdown or explanation.

Output format:
{
  "day": "Monday" (or "Day 1", "Push Day", etc. — use the page's label),
  "focus": "Short description e.g. Chest & Triceps",
  "exercises": [
    { "name": "Exercise Name", "sets": "3", "reps": "10", "notes": "" },
    ...
  ]
}

Rules:
- Each exercise has: name (string), sets (string like "3" or "3-4"), reps (string like "10" or "8-12" or "AMRAP"), notes (string, optional)
- If sets/reps are ranges, use the format "3-4" or "8-12"
- Include warmup exercises in exercises if listed; or put them first with notes "warmup"
- Omit any exercise you cannot parse
- Use the page's exercise names as written when clear
- focus: 2–4 word summary (e.g. "Upper body", "Legs", "Full body")
- If multiple workouts in the text, return the first/main one`;

/** Best-effort: fenced code, balanced braces, then greedy `{...}`. */
function extractJsonObjectFromLlm(raw: string): string | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const inner = fence[1].trim();
    if (inner.startsWith("{")) return inner;
  }
  if (trimmed.startsWith("{")) {
    let depth = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return trimmed.slice(0, i + 1);
      }
    }
  }
  const greedy = raw.match(/\{[\s\S]*\}/);
  return greedy ? greedy[0] : null;
}

export type ParseFail = { ok: false; code: string; error: string };
export type ParseOk = { ok: true; workout: WorkoutDay };
export type WorkoutLlmParseResult = ParseOk | ParseFail;

export function parseModelOutputToWorkout(raw: string): WorkoutLlmParseResult {
  const jsonStr = extractJsonObjectFromLlm(raw);
  if (!jsonStr) {
    return {
      ok: false,
      code: "AI_NO_JSON",
      error:
        "The model did not return workout JSON. Try clearer exercise names with sets and reps, or a shorter excerpt.",
    };
  }

  let parsed: {
    day?: string;
    focus?: string;
    exercises?: Array<{ name?: string; sets?: string; reps?: string; notes?: string }>;
  };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      ok: false,
      code: "AI_BAD_JSON",
      error: "Could not parse workout structure from model output.",
    };
  }

  const workout = normalizeWorkoutDayFromParsed(parsed);
  if (!workout) {
    return {
      ok: false,
      code: "NO_EXERCISES",
      error:
        "No exercises were found. Use a PDF or page that lists exercise names with sets and reps.",
    };
  }
  return { ok: true, workout };
}

export const WORKOUT_PROGRAM_JSON_SYSTEM = `You extract a full multi-week workout program from PDF text or program sheets. Return ONLY valid JSON, no markdown or explanation.

Output format:
{
  "programTitle": "Short title if obvious from the text",
  "days": [
    {
      "day": "Monday — Week 1",
      "focus": "Chest & triceps",
      "warmups": [ { "name", "sets", "reps", "notes" } ],
      "exercises": [ { "name", "sets", "reps", "notes" } ],
      "finishers": [ { "name", "sets", "reps", "notes" } ]
    },
    ...
  ]
}

Rules:
- Extract EVERY distinct training session in the text (each day/week block). Do not stop after week 1 or after Monday only.
- Programs that list Monday, Wednesday, and Friday (or other weekdays) under each "Week N" MUST produce separate days[] entries for EACH of those sessions with different exercises — never merge Wednesday or Friday into Monday.
- Each object in "days" must include at least one main exercise in "exercises".
- "day" MUST start with the English weekday (Monday, Tuesday, …) so schedulers can match the calendar, then " — Week N" with the week number from the document (e.g. "Wednesday — Week 4"). If the PDF skips week numbers for some blocks, infer consecutive weeks from order.
- "focus": 2–6 words (e.g. "Pull — back & biceps").
- warmups/finishers: optional arrays; same shape as exercises. Omit empty arrays.
- sets/reps as strings; use ranges like "8-12" when given.
- If the PDF has broken/garbled lines, reconstruct sensible exercises from context; omit only lines you cannot interpret.`;

export type ProgramParseFail = { ok: false; code: string; error: string };
export type ProgramParseOk = { ok: true; programTitle?: string; days: WorkoutDay[] };
export type ProgramLlmParseResult = ProgramParseOk | ProgramParseFail;

export function parseModelOutputToProgram(raw: string): ProgramLlmParseResult {
  const jsonStr = extractJsonObjectFromLlm(raw);
  if (!jsonStr) {
    return {
      ok: false,
      code: "AI_NO_JSON",
      error: "The model did not return program JSON. Try a shorter PDF or text-based export.",
    };
  }

  let parsed: {
    programTitle?: string;
    days?: Array<{
      day?: string;
      focus?: string;
      warmups?: Array<{ name?: string; sets?: string; reps?: string; notes?: string }>;
      exercises?: Array<{ name?: string; sets?: string; reps?: string; notes?: string }>;
      finishers?: Array<{ name?: string; sets?: string; reps?: string; notes?: string }>;
    }>;
  };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, code: "AI_BAD_JSON", error: "Could not parse program structure from model output." };
  }

  const days: WorkoutDay[] = [];
  for (const d of parsed.days ?? []) {
    const w = normalizeWorkoutDayFromParsed(d);
    if (w) days.push(w);
  }

  if (days.length === 0) {
    return {
      ok: false,
      code: "NO_DAYS",
      error: "No workout days with exercises were found in the model output.",
    };
  }

  const programTitle =
    typeof parsed.programTitle === "string" && parsed.programTitle.trim()
      ? parsed.programTitle.trim()
      : undefined;
  return { ok: true, programTitle, days };
}
