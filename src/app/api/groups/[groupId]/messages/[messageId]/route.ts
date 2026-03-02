import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbDeleteGroupMessage, dbUpdateGroupMessagePin, dbGetUserGroups } from "@/lib/db";
import { z } from "zod";

type Params = { params: Promise<{ groupId: string; messageId: string }> };

const patchSchema = z.object({ pinned: z.boolean() });

export async function PATCH(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-msg-pin"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId, messageId } = await params;
  const timestamp = req.nextUrl.searchParams.get("ts");
  if (!timestamp) return NextResponse.json({ error: "Missing timestamp (ts) query param" }, { status: 400 });

  const userGroups = await dbGetUserGroups(userId);
  if (!userGroups.some((g) => g.groupId === groupId)) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await dbUpdateGroupMessagePin(groupId, messageId, timestamp, parsed.data.pinned);
  if (!updated) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "group-msg-delete"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId, messageId } = await params;
  const timestamp = req.nextUrl.searchParams.get("ts");
  if (!timestamp) return NextResponse.json({ error: "Missing timestamp" }, { status: 400 });

  // Verify membership
  const userGroups = await dbGetUserGroups(userId);
  if (!userGroups.some((g) => g.groupId === groupId)) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  await dbDeleteGroupMessage(groupId, messageId, timestamp);
  return NextResponse.json({ ok: true });
}
