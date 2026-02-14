"use client";

import { getBadgeInfo } from "@/lib/milestones";
import type { Milestone } from "@/lib/types";

const BADGE_ICONS: Record<string, string> = {
  first_meal: "🍽️",
  meal_streak_3: "🔥",
  meal_streak_7: "⚡",
  meal_streak_14: "💪",
  meal_streak_30: "🏆",
  macro_hit_week: "🎯",
  macro_hit_month: "👑",
  week_warrior: "📅",
  plan_adjuster: "🔄",
  early_adopter: "⌚",
  wearable_synced: "📊",
};

export function MilestonesView({
  milestones,
  xp,
  progress,
}: {
  milestones: Milestone[];
  xp: number;
  progress: Record<string, number>;
}) {
  const badgeInfo = getBadgeInfo();
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const xpForNext = (level * level) * 100 - xp;
  const xpInLevel = xp - ((level - 1) * (level - 1) * 100);
  const xpNeededForLevel = (level * level) * 100 - ((level - 1) * (level - 1) * 100);
  const levelProgress = Math.min(100, (xpInLevel / xpNeededForLevel) * 100);

  const earnedIds = new Set<string>(milestones.map((m) => m.id));
  const allBadges = Object.entries(badgeInfo);

  return (
    <div className="space-y-8">
      <div className="card rounded-xl p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--accent)]">Your Progress</h2>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)]/20 text-2xl font-bold text-[var(--accent)]">
              {level}
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">Level</p>
              <p className="text-xl font-bold">{level}</p>
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="mb-1 flex justify-between text-xs text-[var(--muted)]">
              <span>{xp} XP</span>
              <span>{xpForNext} XP to next level</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--border-soft)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                style={{ width: `${levelProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card rounded-xl p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--accent)]">Badges</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {allBadges.map(([id, info]) => {
            const earned = earnedIds.has(id);
            const displayProgress = id.startsWith("meal_streak")
              ? progress[`streak_${id.replace("meal_streak_", "")}`]
              : id === "macro_hit_week"
                ? progress.macro_week
                : id === "week_warrior"
                  ? progress.week_warrior
                  : null;

            return (
              <div
                key={id}
                className={`flex flex-col items-center rounded-lg border p-4 transition ${
                  earned
                    ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
                    : "border-[var(--border)] bg-[var(--surface-elevated)] opacity-90"
                }`}
              >
                <span className="mb-2 text-3xl">{BADGE_ICONS[id] ?? "🏅"}</span>
                <p className="text-center text-sm font-medium text-[var(--foreground)]">{info.name}</p>
                <p className="mt-0.5 text-center text-xs text-[var(--muted)]">{info.desc}</p>
                {!earned && displayProgress != null && displayProgress > 0 && (
                  <div className="mt-2 w-full">
                    <div className="h-1 overflow-hidden rounded-full bg-[var(--border-soft)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]/50"
                        style={{ width: `${displayProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {earned && <p className="mt-1 text-xs text-[var(--accent)]">+{info.xp} XP</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
