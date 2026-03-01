import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbGetSocialSettings, dbSaveSocialSettings, dbReserveUsername, dbReleaseUsername } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  visibility: z.enum(["badges_only", "badges_stats", "full_transparency"]),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
});

export async function GET(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "social-settings"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const settings = await dbGetSocialSettings(userId);
  return NextResponse.json(settings ?? { visibility: "badges_only" });
}

export async function PUT(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "social-settings-update"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const { visibility, username } = parsed.data;
  const existing = await dbGetSocialSettings(userId);

  // Handle username change
  if (username && username !== existing?.username) {
    const reserved = await dbReserveUsername(userId, username);
    if (!reserved) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    // Release old username
    if (existing?.username) {
      await dbReleaseUsername(existing.username);
    }
  }

  const settings = { visibility, username: username ?? existing?.username };
  await dbSaveSocialSettings(userId, settings);

  return NextResponse.json(settings);
}
