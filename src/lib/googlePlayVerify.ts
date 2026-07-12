type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type SubscriptionV2Response = {
  subscriptionState?: string;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
  acknowledgementState?: string;
};

const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function b64url(input: string | ArrayBuffer): string {
  const str =
    typeof input === "string"
      ? btoa(input)
      : btoa(String.fromCharCode(...new Uint8Array(input)));
  return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: sa.client_email, scope: PLAY_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })
  );
  const signingInput = `${header}.${payload}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${b64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access_token in token response");
  return data.access_token;
}

export type PlayVerifyResult = {
  valid: boolean;
  expiryTime: string;
  subscriptionState: string;
  autoRenewing: boolean;
  productId: string;
};

export async function verifyPlaySubscription(
  packageName: string,
  subscriptionId: string,
  purchaseToken: string
): Promise<PlayVerifyResult> {
  const saJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!saJson) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured");

  const sa = JSON.parse(saJson) as ServiceAccount;
  const accessToken = await getAccessToken(sa);

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Play API error ${res.status}: ${await res.text()}`);

  const sub = (await res.json()) as SubscriptionV2Response;

  const state = sub.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED";
  const item = sub.lineItems?.[0];
  const expiryTime = item?.expiryTime ?? new Date(0).toISOString();
  const autoRenewing = item?.autoRenewingPlan?.autoRenewEnabled ?? false;
  const productId = item?.productId ?? subscriptionId;

  const activeStates = new Set([
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  ]);
  const valid = activeStates.has(state) && new Date(expiryTime) > new Date();

  return { valid, expiryTime, subscriptionState: state, autoRenewing, productId };
}
