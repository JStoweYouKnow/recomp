import { dbGetPlaySubscription } from "@/lib/db";

const proUserIds = new Set(
  (process.env.PRO_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);

export async function hasProAccess(userId: string): Promise<boolean> {
  if (proUserIds.has(userId)) return true;
  try {
    const sub = await dbGetPlaySubscription(userId);
    if (sub && new Date(sub.expiryTime) > new Date()) return true;
  } catch {
    // Don't block login if DynamoDB is unavailable
  }
  return false;
}
