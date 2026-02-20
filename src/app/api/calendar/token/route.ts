import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbGetMeta, dbSetCalendarToken } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const meta = await dbGetMeta(userId);
  let token = meta.calendarFeedToken;

  if (!token) {
    token = randomUUID();
    await dbSetCalendarToken(userId, token);
  }

  return NextResponse.json({ token });
}
