import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbGetExpoPushTokens, dbGetFcmPushTokens, dbGetPushSubscriptions } from "@/lib/db";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ enabled: false }, { status: 200 });
  }
  const [subs, expo, fcm] = await Promise.all([
    dbGetPushSubscriptions(userId),
    dbGetExpoPushTokens(userId),
    dbGetFcmPushTokens(userId),
  ]);
  const enabled = subs.length > 0 || expo.length > 0 || fcm.length > 0;
  return NextResponse.json({ enabled });
}
