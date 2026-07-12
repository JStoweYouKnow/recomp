import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbSavePlaySubscription } from "@/lib/db";
import { verifyPlaySubscription } from "@/lib/googlePlayVerify";
import { logInfo, logError } from "@/lib/logger";

type Body = {
  packageName?: string;
  subscriptionId?: string;
  purchaseToken?: string;
};

export async function POST(req: NextRequest) {
  const userId = await getUserId(req.headers);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const packageName = body.packageName?.trim();
  const subscriptionId = body.subscriptionId?.trim();
  const purchaseToken = body.purchaseToken?.trim();

  if (!packageName || !subscriptionId || !purchaseToken) {
    return NextResponse.json(
      { error: "Missing packageName, subscriptionId, or purchaseToken" },
      { status: 400 }
    );
  }

  if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim()) {
    logError("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set", null, { route: "billing/google-play/verify" });
    return NextResponse.json({ error: "Server billing configuration missing" }, { status: 503 });
  }

  try {
    const result = await verifyPlaySubscription(packageName, subscriptionId, purchaseToken);

    if (!result.valid) {
      logInfo("Play purchase invalid or expired", { userId, subscriptionState: result.subscriptionState, expiryTime: result.expiryTime });
      return NextResponse.json({ ok: false, error: "Subscription is not active", subscriptionState: result.subscriptionState }, { status: 402 });
    }

    await dbSavePlaySubscription(userId, {
      purchaseToken,
      subscriptionId: result.productId,
      packageName,
      expiryTime: result.expiryTime,
      subscriptionState: result.subscriptionState,
      autoRenewing: result.autoRenewing,
      verifiedAt: new Date().toISOString(),
    });

    logInfo("Play subscription verified and saved", { userId, productId: result.productId, expiryTime: result.expiryTime });

    return NextResponse.json({ ok: true, verified: true, expiryTime: result.expiryTime, autoRenewing: result.autoRenewing });
  } catch (err) {
    logError("Play subscription verification failed", err, { route: "billing/google-play/verify", userId });
    return NextResponse.json({ error: "Verification failed", detail: (err as Error).message }, { status: 500 });
  }
}
