import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbGetGroupMessages, dbPostGroupMessage, dbGetUserGroups, dbGetProfile } from "@/lib/db";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-messages-read"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;

  // Verify membership
  const userGroups = await dbGetUserGroups(userId);
  if (!userGroups.some((g) => g.groupId === groupId)) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
  const messages = await dbGetGroupMessages(groupId, Math.min(100, Math.max(1, limit)));

  return NextResponse.json(messages);
}

const postSchema = z.object({
  text: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-messages-post"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;

  // Verify membership
  const userGroups = await dbGetUserGroups(userId);
  if (!userGroups.some((g) => g.groupId === groupId)) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message", details: parsed.error.flatten() }, { status: 400 });
  }

  const profile = await dbGetProfile(userId);

  const message = {
    id: uuidv4(),
    authorId: userId,
    authorName: profile?.name ?? "Unknown",
    authorAvatarUrl: profile?.avatarDataUrl,
    text: parsed.data.text,
    createdAt: new Date().toISOString(),
  };

  await dbPostGroupMessage(groupId, message);

  return NextResponse.json(message, { status: 201 });
}
