import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbSavePushSubscription } from "@/lib/db";
import { isPushConfigured } from "@/lib/push";
import type { PushSubscriptionRecord } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push notifications not configured" }, { status: 503 });
  }

  const userId = await getUserId(req.headers);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { subscription?: PushSubscriptionRecord };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "Missing subscription (endpoint and keys)" }, { status: 400 });
  }

  const record: PushSubscriptionRecord = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    userAgent: req.headers.get("user-agent") ?? undefined,
    createdAt: new Date().toISOString(),
  };

  await dbSavePushSubscription(userId, record);
  return NextResponse.json({ ok: true });
}
