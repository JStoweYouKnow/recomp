import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import type { WorkoutDay, WorkoutExercise } from "@/lib/types";

/**
 * Fetch a workout URL and extract exercises using Nova AI.
 * Supports fitness blogs, YouTube descriptions, program PDFs (via text), etc.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await fixedWindowRateLimit(
      getClientKey(getRequestIp(req), "workouts-parse-url"),
      15,
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
      return res;
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    const trimmed = url.trim();
    if (
      !trimmed.startsWith("http://") &&
      !trimmed.startsWith("https://")
    ) {
      return NextResponse.json(
        { error: "Invalid URL. Use http:// or https://" },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const res = await fetch(trimmed, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RefactorWorkoutBot/1.0; +https://github.com/JStoweYouKnow/recomp)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch URL: ${res.status}` },
        { status: 422 }
      );
    }

    const html = await res.text();

    // Strip scripts, styles, normalize whitespace
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000);

    if (textContent.length < 100) {
      return NextResponse.json(
        { error: "Page has insufficient text to parse a workout" },
        { status: 422 }
      );
    }

    const systemPrompt = `You extract workout exercises from web pages. Return ONLY valid JSON, no markdown or explanation.

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
- If multiple workouts on the page, return the first/main one`;

    const userPrompt = `Extract the workout from this page. Return ONLY a JSON object with day, focus, and exercises array.

PAGE EXCERPT:
${textContent}`;

    const raw = await invokeNova(systemPrompt, userPrompt, {
      temperature: 0.2,
      maxTokens: 2048,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { error: "Could not parse workout from page" },
        { status: 422 }
      );
    }

    let parsed: { day?: string; focus?: string; exercises?: Array<{ name?: string; sets?: string; reps?: string; notes?: string }> };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return NextResponse.json(
        { error: "Could not parse workout structure" },
        { status: 422 }
      );
    }

    const exercises: WorkoutExercise[] = (parsed.exercises ?? [])
      .filter((e): e is { name: string; sets?: string; reps?: string; notes?: string } =>
        e && typeof e.name === "string" && e.name.trim().length > 0
      )
      .map((e) => ({
        name: String(e.name).trim(),
        sets: String(e.sets ?? "3").trim() || "3",
        reps: String(e.reps ?? "10").trim() || "10",
        notes: e.notes ? String(e.notes).trim() : undefined,
      }));

    if (exercises.length === 0) {
      return NextResponse.json(
        { error: "No exercises found on this page" },
        { status: 422 }
      );
    }

    const workout: WorkoutDay = {
      day: String(parsed.day ?? "Imported").trim() || "Imported",
      focus: String(parsed.focus ?? "Imported workout").trim() || "Imported workout",
      exercises,
    };

    const headers = getRateLimitHeaderValues(rl);
    const response = NextResponse.json({ workout });
    response.headers.set("X-RateLimit-Limit", headers.limit);
    response.headers.set("X-RateLimit-Remaining", headers.remaining);
    response.headers.set("X-RateLimit-Reset", headers.reset);
    return response;
  } catch (err) {
    console.error("Parse workout URL error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse workout" },
      { status: 500 }
    );
  }
}
