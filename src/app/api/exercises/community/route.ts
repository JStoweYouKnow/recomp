import { NextRequest, NextResponse } from "next/server";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { withRequestLogging } from "@/lib/logger";
import { dbSearchCommunityExercises, dbGetPopularExercises } from "@/lib/db";

/** Built-in exercise database for instant results before community data grows. */
const COMMON_EXERCISES: { name: string; category: string; defaultSets: string; defaultReps: string }[] = [
  // Upper Body - Push
  { name: "Bench Press", category: "Upper Body", defaultSets: "4", defaultReps: "6-8" },
  { name: "Incline Dumbbell Press", category: "Upper Body", defaultSets: "3", defaultReps: "8-10" },
  { name: "Overhead Press", category: "Upper Body", defaultSets: "3", defaultReps: "8-10" },
  { name: "Dumbbell Shoulder Press", category: "Upper Body", defaultSets: "3", defaultReps: "8-12" },
  { name: "Push-Up", category: "Upper Body", defaultSets: "3", defaultReps: "10-15" },
  { name: "Dips", category: "Upper Body", defaultSets: "3", defaultReps: "8-12" },
  { name: "Lateral Raise", category: "Upper Body", defaultSets: "3", defaultReps: "12-15" },
  { name: "Tricep Pushdown", category: "Upper Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Skull Crusher", category: "Upper Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Close-Grip Bench Press", category: "Upper Body", defaultSets: "3", defaultReps: "8-10" },
  // Upper Body - Pull
  { name: "Pull-Up", category: "Upper Body", defaultSets: "3", defaultReps: "6-10" },
  { name: "Chin-Up", category: "Upper Body", defaultSets: "3", defaultReps: "6-10" },
  { name: "Bent Over Row", category: "Upper Body", defaultSets: "3", defaultReps: "8-10" },
  { name: "Lat Pulldown", category: "Upper Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Seated Cable Row", category: "Upper Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Dumbbell Row", category: "Upper Body", defaultSets: "3", defaultReps: "8-10" },
  { name: "Face Pull", category: "Upper Body", defaultSets: "3", defaultReps: "15-20" },
  { name: "Barbell Curl", category: "Upper Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Hammer Curl", category: "Upper Body", defaultSets: "3", defaultReps: "10-12" },
  // Lower Body
  { name: "Back Squat", category: "Lower Body", defaultSets: "4", defaultReps: "5-6" },
  { name: "Front Squat", category: "Lower Body", defaultSets: "3", defaultReps: "6-8" },
  { name: "Goblet Squat", category: "Lower Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Romanian Deadlift", category: "Lower Body", defaultSets: "3", defaultReps: "8-10" },
  { name: "Conventional Deadlift", category: "Lower Body", defaultSets: "4", defaultReps: "5" },
  { name: "Leg Press", category: "Lower Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Walking Lunge", category: "Lower Body", defaultSets: "3", defaultReps: "10 per leg" },
  { name: "Bulgarian Split Squat", category: "Lower Body", defaultSets: "3", defaultReps: "8-10 per leg" },
  { name: "Hip Thrust", category: "Lower Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Leg Curl", category: "Lower Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Leg Extension", category: "Lower Body", defaultSets: "3", defaultReps: "10-12" },
  { name: "Calf Raise", category: "Lower Body", defaultSets: "3", defaultReps: "15-20" },
  // Core
  { name: "Plank", category: "Core", defaultSets: "3", defaultReps: "45s" },
  { name: "Hanging Leg Raise", category: "Core", defaultSets: "3", defaultReps: "10-12" },
  { name: "Ab Wheel Rollout", category: "Core", defaultSets: "3", defaultReps: "8-10" },
  { name: "Cable Woodchop", category: "Core", defaultSets: "3", defaultReps: "12 per side" },
  { name: "Russian Twist", category: "Core", defaultSets: "3", defaultReps: "15 per side" },
  { name: "Dead Bug", category: "Core", defaultSets: "3", defaultReps: "10 per side" },
  // Conditioning
  { name: "Burpee", category: "Conditioning", defaultSets: "3", defaultReps: "10" },
  { name: "Mountain Climber", category: "Conditioning", defaultSets: "3", defaultReps: "30s" },
  { name: "Jump Rope", category: "Conditioning", defaultSets: "3", defaultReps: "60s" },
  { name: "Box Jump", category: "Conditioning", defaultSets: "3", defaultReps: "8-10" },
  { name: "Kettlebell Swing", category: "Conditioning", defaultSets: "3", defaultReps: "15" },
  { name: "Battle Ropes", category: "Conditioning", defaultSets: "3", defaultReps: "30s" },
  { name: "Farmer's Carry", category: "Conditioning", defaultSets: "3", defaultReps: "40m" },
  // Warm-up / Mobility
  { name: "Arm Circles", category: "Warm-up", defaultSets: "1", defaultReps: "10 each direction" },
  { name: "Band Pull-Aparts", category: "Warm-up", defaultSets: "1", defaultReps: "15" },
  { name: "Bodyweight Squat", category: "Warm-up", defaultSets: "1", defaultReps: "10" },
  { name: "Hip Circles", category: "Warm-up", defaultSets: "1", defaultReps: "10 each direction" },
  { name: "Cat-Cow Stretch", category: "Warm-up", defaultSets: "1", defaultReps: "8" },
  { name: "Hip Flexor Stretch", category: "Warm-up", defaultSets: "2", defaultReps: "30s per side" },
  { name: "Incline Walk", category: "Warm-up", defaultSets: "1", defaultReps: "10-15 min" },
];

export const GET = withRequestLogging("/api/exercises/community", async function GET(req: NextRequest) {
  try {
    const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "exercises-community"), 60, 60_000);
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const category = req.nextUrl.searchParams.get("category")?.trim() ?? "";
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 50);

    // If no query, return popular exercises (optionally filtered by category)
    if (!query) {
      const popular = await dbGetPopularExercises(limit);
      const filtered = category
        ? popular.filter((e) => e.category?.toLowerCase() === category.toLowerCase())
        : popular;

      // Fill with common exercises if community DB is sparse
      const popularNames = new Set(filtered.map((e) => e.normalizedName));
      const commonFiltered = COMMON_EXERCISES
        .filter((e) => !category || e.category.toLowerCase() === category.toLowerCase())
        .filter((e) => !popularNames.has(e.name.toLowerCase()))
        .slice(0, Math.max(0, limit - filtered.length))
        .map((e) => ({
          name: e.name,
          normalizedName: e.name.toLowerCase(),
          defaultSets: e.defaultSets,
          defaultReps: e.defaultReps,
          category: e.category,
          logCount: 0,
        }));
      return NextResponse.json({ results: [...filtered, ...commonFiltered].slice(0, limit) });
    }

    // Search local common exercises first (instant)
    const lowerQuery = query.toLowerCase();
    const commonMatches = COMMON_EXERCISES
      .filter((e) => {
        const lower = e.name.toLowerCase();
        return lower.includes(lowerQuery) || lowerQuery.includes(lower);
      })
      .filter((e) => !category || e.category.toLowerCase() === category.toLowerCase())
      .slice(0, 5)
      .map((e) => ({
        name: e.name,
        normalizedName: e.name.toLowerCase(),
        defaultSets: e.defaultSets,
        defaultReps: e.defaultReps,
        category: e.category,
        logCount: 1000, // Rank common exercises highly
      }));

    // Search community exercises from DynamoDB
    const communityMatches = await dbSearchCommunityExercises(query, limit);

    // Merge and deduplicate by normalizedName, preferring higher logCount
    const seen = new Set<string>();
    const merged = [...commonMatches, ...communityMatches]
      .sort((a, b) => b.logCount - a.logCount)
      .filter((item) => {
        const key = item.normalizedName;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((item) => !category || (item.category ?? "").toLowerCase() === category.toLowerCase())
      .slice(0, limit);

    return NextResponse.json({ results: merged });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
});
