import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are a workout music recommendation AI. Given a workout type/focus and music provider preference, suggest 3-5 playlists or albums.

For Spotify, generate deep links like: https://open.spotify.com/search/{query}
For Apple Music, generate deep links like: https://music.apple.com/search?term={query}

Return JSON array: [{
  "name": string,
  "description": string,
  "provider": "spotify"|"apple_music",
  "deepLink": string,
  "bpm": string (e.g. "120-140"),
  "mood": string (e.g. "aggressive", "focused", "chill")
}]

Match music energy to workout type: heavy lifting = high energy/aggressive, yoga = chill/ambient, cardio = uptempo/motivating, HIIT = intense/fast.`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "music-suggest"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { workoutFocus, provider } = await req.json();

    const prompt = `Workout type: ${workoutFocus ?? "general strength training"}
Music provider: ${provider ?? "spotify"}

Suggest 3-5 playlists/albums with deep links.`;

    const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.8, maxTokens: 1024 });
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ suggestions: [] });
    const suggestions = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ suggestions });
  } catch (err) {
    logError("Music suggest failed", err, { route: "music/suggest" });
    return NextResponse.json({ error: "Suggestion failed" }, { status: 500 });
  }
}
