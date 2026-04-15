import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbGetPushSubscriptions } from "@/lib/db";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ enabled: false }, { status: 200 });
  }
  const subs = await dbGetPushSubscriptions(userId);
  return NextResponse.json({ enabled: subs.length > 0 });
}
