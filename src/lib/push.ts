import webpush from "web-push";
import { dbGetPushSubscriptions, dbGetExpoPushTokens } from "./db";
import type { PushSubscriptionRecord } from "./db";

const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails("mailto:support@recomp.app", vapidPublic, vapidPrivate);
}

export function isPushConfigured(): boolean {
  return Boolean(vapidPublic && vapidPrivate);
}

export function getVapidPublicKey(): string | null {
  return vapidPublic ?? null;
}

export interface PushPayload {
  title: string;
  body?: string;
  tag?: string;
  data?: { url?: string };
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const [subs, expoTokens] = await Promise.all([
    dbGetPushSubscriptions(userId),
    dbGetExpoPushTokens(userId),
  ]);

  let sent = 0;
  let failed = 0;

  if (vapidPublic && vapidPrivate && subs.length > 0) {
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      tag: payload.tag ?? "recomp",
      data: payload.data ?? {},
    });

    await Promise.all(
      subs.map(async (sub: PushSubscriptionRecord) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
            },
            body,
            { TTL: 86400 }
          );
          sent++;
        } catch {
          failed++;
        }
      })
    );
  }

  if (expoTokens.length > 0) {
    const messages = expoTokens.map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body ?? "",
      data: payload.data ?? {},
      sound: "default" as const,
    }));

    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
      });
      const data = await res.json();
      if (data.data) {
        for (const ticket of Array.isArray(data.data) ? data.data : [data.data]) {
          if (ticket?.status === "ok") sent++;
          else failed++;
        }
      } else if (data.errors) {
        failed += expoTokens.length;
      }
    } catch {
      failed += expoTokens.length;
    }
  }

  return { sent, failed };
}
