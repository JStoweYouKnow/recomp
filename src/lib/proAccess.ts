const proUserIds = new Set(
  (process.env.PRO_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);

export function hasProAccess(userId: string): boolean {
  return proUserIds.has(userId);
}
