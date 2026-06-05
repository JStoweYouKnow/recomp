import { NextRequest, NextResponse } from "next/server";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logInfo, logError } from "@/lib/logger";
import fallbackMap from "@/lib/exercise-fallback-map.json";

const EXERCISEDB_BASE = "https://www.exercisedb.dev/api/v1/exercises";

interface ExerciseResult {
  exerciseId: string;
  name: string;
  gifUrl: string;
  targetMuscles: string[];
  bodyParts: string[];
  equipments: string[];
  instructions: string[];
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Look up a fallback exercise ID from the local map by exercise name (fuzzy). */
function lookupFallbackId(name: string): string | null {
  const map = fallbackMap as Record<string, string>;
  const key = normalizeName(name);
  if (map[key]) return map[key];
  const words = key.split(/\s+/).filter((w) => w.length >= 2);
  for (const term of [
    words.join(" "),
    words.slice(-2).join(" "),
    words.slice(-1)[0],
    words[0],
    ...words.slice(1, -1),
  ]) {
    if (term && map[term]) return map[term];
  }
  return null;
}

/** Build a JSON response from a fallback-map match (no live API data). */
function fallbackResult(id: string, searchName: string): NextResponse {
  const nameParam = `&name=${encodeURIComponent(searchName)}`;
  return NextResponse.json({
    exerciseId: id,
    name: searchName,
    gifUrl: `/api/exercises/gif?id=${encodeURIComponent(id)}${nameParam}`,
    targetMuscles: [],
    instructions: [],
  });
}

/** Return gif via our proxy; pass name for fallback lookup when CDN fails. */
function jsonResult(best: ExerciseResult, searchName: string): NextResponse {
  const nameParam = searchName ? `&name=${encodeURIComponent(searchName)}` : "";
  return NextResponse.json({
    exerciseId: best.exerciseId,
    name: best.name,
    gifUrl: `/api/exercises/gif?id=${encodeURIComponent(best.exerciseId)}${nameParam}`,
    targetMuscles: best.targetMuscles,
    instructions: best.instructions?.slice(0, 3) ?? [],
  });
}

/**
 * Search for an exercise by name. Tries exercisedb.dev live API first;
 * falls back to the local fallback map when the live API is unavailable.
 */
export async function GET(req: NextRequest) {
  const rl = await fixedWindowRateLimit(
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

  // ── 1. Try live exercisedb.dev API ──────────────────────────────────────────
  try {
    const res = await fetch(
      `${EXERCISEDB_BASE}?search=${encodeURIComponent(name.toLowerCase())}&limit=5`,
      { next: { revalidate: 86400 } }
    );

    if (res.ok) {
      const json = await res.json();
      const exercises: ExerciseResult[] = json.data ?? [];

      if (exercises.length > 0) {
        const nameLower = name.toLowerCase();
        const exact = exercises.find((e) => e.name.toLowerCase() === nameLower);
        return jsonResult(exact ?? exercises[0], name);
      }

      // Live API returned empty — try word-phrase fallbacks against live API
      const words = name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const seen = new Set<string>();
      const liveFallbacks: string[] = [];
      for (const t of [
        words.slice(-2).join(" "),
        words.slice(-1)[0],
        words[0],
        ...words.slice(1, -1),
      ]) {
        if (t && t.length >= 2 && t !== name.toLowerCase() && !seen.has(t)) {
          seen.add(t);
          liveFallbacks.push(t);
        }
      }

      for (const term of liveFallbacks) {
        const res2 = await fetch(
          `${EXERCISEDB_BASE}?search=${encodeURIComponent(term)}&limit=3`,
          { next: { revalidate: 86400 } }
        );
        if (res2.ok) {
          const json2 = await res2.json();
          const ex2: ExerciseResult[] = json2.data ?? [];
          if (ex2.length > 0) return jsonResult(ex2[0], name);
        }
      }
    } else {
      logError("exercise-search", { liveApiStatus: res.status });
    }
  } catch (err) {
    logError("exercise-search-live", err);
  }

  // ── 2. Fallback: local exercise map ─────────────────────────────────────────
  const fallbackId = lookupFallbackId(name);
  if (fallbackId) {
    logInfo("exercise-search-fallback", { name, fallbackId });
    return fallbackResult(fallbackId, name);
  }

  // ── 3. Nothing found ─────────────────────────────────────────────────────────
  return NextResponse.json(
    { exerciseId: "", name, gifUrl: null, targetMuscles: [], instructions: [] },
    { status: 200 }
  );
}
