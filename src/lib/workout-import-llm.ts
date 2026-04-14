import type { WorkoutDay, WorkoutExercise } from "@/lib/types";

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

  const exercises: WorkoutExercise[] = (parsed.exercises ?? [])
    .filter((e): e is { name: string; sets?: string; reps?: string; notes?: string } =>
      Boolean(e && typeof e.name === "string" && e.name.trim().length > 0)
    )
    .map((e) => ({
      name: String(e.name).trim(),
      sets: String(e.sets ?? "3").trim() || "3",
      reps: String(e.reps ?? "10").trim() || "10",
      notes: e.notes ? String(e.notes).trim() : undefined,
    }));

  if (exercises.length === 0) {
    return {
      ok: false,
      code: "NO_EXERCISES",
      error:
        "No exercises were found. Use a PDF or page that lists exercise names with sets and reps.",
    };
  }

  const workout: WorkoutDay = {
    day: String(parsed.day ?? "Imported").trim() || "Imported",
    focus: String(parsed.focus ?? "Imported workout").trim() || "Imported workout",
    exercises,
  };
  return { ok: true, workout };
}
