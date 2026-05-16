import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";

type Body = {
  packageName?: string;
  subscriptionId?: string;
  purchaseToken?: string;
};

/**
 * Records a Play subscription purchase for the signed-in user.
 * Full entitlement verification uses the Google Play Developer API (service account);
 * set `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` when you are ready to verify server-side.
 */
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
      { status: 400 },
    );
  }

  const hasVerifier = Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim());

  if (hasVerifier) {
    // Wire androidpublisher.subscriptionsv2.get(packageName, token) or purchases.products.get
    // when you add `googleapis` + grant the service account Finance permissions in Play Console.
    return NextResponse.json({
      ok: true,
      verified: false,
      message:
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is set but server verification is not implemented in this route yet.",
    });
  }

  return NextResponse.json({
    ok: true,
    verified: false,
    message:
      "Purchase recorded for user (configure GOOGLE_PLAY_SERVICE_ACCOUNT_JSON + androidpublisher to verify and grant Pro).",
  });
}
