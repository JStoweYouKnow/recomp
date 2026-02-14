import { NextRequest, NextResponse } from "next/server";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logInfo, logError } from "@/lib/logger";

const EXERCISEDB_BASE = "https://exercisedb-api.vercel.app/api/v1/exercises";

interface ExerciseResult {
  exerciseId: string;
  name: string;
  gifUrl: string;
  targetMuscles: string[];
  bodyParts: string[];
  equipments: string[];
  instructions: string[];
}

/**
 * Search ExerciseDB for an exercise by name and return the best match with a GIF URL.
 * Free API, no key required.
 */
export async function GET(req: NextRequest) {
  const rl = fixedWindowRateLimit(
    getClientKey(getRequestIp(req), "exercise-search"),
    30,
    60_000
  );
  if (!rl.ok)
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name)
    return NextResponse.json({ error: "Missing ?name= parameter" }, { status: 400 });

  logInfo("exercise-search", { name });

  try {
    // Search with the full name first
    const res = await fetch(
      `${EXERCISEDB_BASE}?search=${encodeURIComponent(name.toLowerCase())}&limit=5`,
      { next: { revalidate: 86400 } } // cache for 24h
    );

    if (!res.ok) {
      logError("exercise-search", { status: res.status });
      return NextResponse.json({ error: "ExerciseDB unavailable" }, { status: 502 });
    }

    const json = await res.json();
    const exercises: ExerciseResult[] = json.data ?? [];

    if (exercises.length > 0) {
      // Find best match: prefer exact name match, then closest
      const nameLower = name.toLowerCase();
      const exact = exercises.find((e) => e.name.toLowerCase() === nameLower);
      const best = exact ?? exercises[0];

      return NextResponse.json({
        exerciseId: best.exerciseId,
        name: best.name,
        gifUrl: best.gifUrl,
        targetMuscles: best.targetMuscles,
        instructions: best.instructions?.slice(0, 3) ?? [],
      });
    }

    // Fallback: try first word only (e.g. "Barbell bench press" → "bench press")
    const words = name.toLowerCase().split(/\s+/);
    if (words.length > 1) {
      const fallbackTerm = words.slice(-2).join(" "); // last two words
      const res2 = await fetch(
        `${EXERCISEDB_BASE}?search=${encodeURIComponent(fallbackTerm)}&limit=3`,
        { next: { revalidate: 86400 } }
      );
      if (res2.ok) {
        const json2 = await res2.json();
        const exercises2: ExerciseResult[] = json2.data ?? [];
        if (exercises2.length > 0) {
          const best = exercises2[0];
          return NextResponse.json({
            exerciseId: best.exerciseId,
            name: best.name,
            gifUrl: best.gifUrl,
            targetMuscles: best.targetMuscles,
            instructions: best.instructions?.slice(0, 3) ?? [],
          });
        }
      }
    }

    return NextResponse.json({ error: "No exercise found", name }, { status: 404 });
  } catch (err) {
    logError("exercise-search", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
