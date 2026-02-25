import { NextRequest, NextResponse } from "next/server";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logInfo, logError } from "@/lib/logger";

const EXERCISEDB_BASE = "https://www.exercisedb.dev/api/v1/exercises";

/** Return gif via our proxy to avoid SSL errors from exercisedb CDN. */
function jsonResult(best: ExerciseResult) {
  return NextResponse.json({
    exerciseId: best.exerciseId,
    name: best.name,
    gifUrl: `/api/exercises/gif?id=${encodeURIComponent(best.exerciseId)}`,
    targetMuscles: best.targetMuscles,
    instructions: best.instructions?.slice(0, 3) ?? [],
  });
}

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
  if (name.length > 300)
    return NextResponse.json({ error: "Name too long (max 300 characters)" }, { status: 400 });

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
      const nameLower = name.toLowerCase();
      const exact = exercises.find((e) => e.name.toLowerCase() === nameLower);
      const best = exact ?? exercises[0];
      return jsonResult(best);
    }

    // Fallback: try various sub-phrases (last 2 words, each word)
    const words = name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const seen = new Set<string>();
    const fallbacks: string[] = [];
    for (const t of [
      words.slice(-2).join(" "),
      words.slice(-1)[0],
      words[0],
      ...words.slice(1, -1),
    ]) {
      if (t && t.length >= 2 && t !== name.toLowerCase() && !seen.has(t)) {
        seen.add(t);
        fallbacks.push(t);
      }
    }

    for (const term of fallbacks) {
      if (!term || term.length < 2) continue;
      const res2 = await fetch(
        `${EXERCISEDB_BASE}?search=${encodeURIComponent(term)}&limit=3`,
        { next: { revalidate: 86400 } }
      );
      if (res2.ok) {
        const json2 = await res2.json();
        const exercises2: ExerciseResult[] = json2.data ?? [];
        if (exercises2.length > 0) {
          return jsonResult(exercises2[0]);
        }
      }
    }

    return NextResponse.json({ error: "No exercise found", name }, { status: 404 });
  } catch (err) {
    logError("exercise-search", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
