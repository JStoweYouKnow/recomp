import type { Metadata } from "next";
import {
  dbGetUserIdByUsername,
  dbGetProfile,
  dbGetSocialSettings,
  dbGetMilestones,
  dbGetMeta,
} from "@/lib/db";
import type { Milestone, PublicProfile } from "@/lib/types";

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

const BADGE_NAMES: Record<string, string> = {
  first_meal: "First Meal",
  meal_streak_3: "3-Day Streak",
  meal_streak_7: "Week Warrior",
  meal_streak_14: "Two Week Champ",
  meal_streak_30: "Monthly Master",
  macro_hit_week: "Macro Week",
  macro_hit_month: "Macro Month",
  week_warrior: "Week Warrior",
  plan_adjuster: "Plan Adjuster",
  early_adopter: "Early Adopter",
  wearable_synced: "Wearable Synced",
};

const GOAL_LABELS: Record<string, string> = {
  lose_weight: "Lose Weight",
  maintain: "Maintain",
  build_muscle: "Build Muscle",
  improve_endurance: "Improve Endurance",
};

function xpToLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const userId = await dbGetUserIdByUsername(username);
  if (!userId) return { title: "User not found | Recomp" };
  const profile = await dbGetProfile(userId);
  const name = profile?.name ?? username;
  return {
    title: `${name} | Recomp`,
    description: `${name}'s fitness journey on Recomp`,
    openGraph: {
      title: `${name} on Recomp`,
      description: `Check out ${name}'s fitness journey, badges, and progress on Recomp.`,
    },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;

  const userId = await dbGetUserIdByUsername(username);
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">User not found</h1>
          <p className="text-[var(--muted)]">No profile exists for @{username}</p>
          <a href="/" className="btn-primary inline-block !py-2.5 !px-6">Join Recomp</a>
        </div>
      </div>
    );
  }

  const [profile, settings, milestones, meta] = await Promise.all([
    dbGetProfile(userId),
    dbGetSocialSettings(userId),
    dbGetMilestones(userId),
    dbGetMeta(userId),
  ]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Profile unavailable</h1>
          <a href="/" className="btn-primary inline-block !py-2.5 !px-6">Join Recomp</a>
        </div>
      </div>
    );
  }

  const visibility = settings?.visibility ?? "badges_only";
  const xp = meta.xp;
  const level = xpToLevel(xp);

  // Fetch extended data for badges_stats+ via API (keep server component clean)
  let publicData: PublicProfile | null = null;
  if (visibility !== "badges_only") {
    // Inline computation to avoid self-fetch
    const res = await fetch(`${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/api/social/profile/${username}`, {
      cache: "no-store",
    }).catch(() => null);
    if (res?.ok) publicData = await res.json();
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          {profile.avatarDataUrl ? (
            <img
              src={profile.avatarDataUrl}
              alt={profile.name}
              className="w-20 h-20 rounded-full mx-auto mb-4 object-cover border-2 border-[var(--accent)]"
            />
          ) : (
            <div className="w-20 h-20 rounded-full mx-auto mb-4 bg-[var(--accent)]/10 flex items-center justify-center text-3xl text-[var(--accent)]">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{profile.name}</h1>
          <p className="text-sm text-[var(--muted)]">@{username}</p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent)]/10 text-sm font-medium text-[var(--accent)]">
              Level {level}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--surface-elevated)] text-sm text-[var(--muted)]">
              {GOAL_LABELS[profile.goal] ?? profile.goal}
            </span>
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">{xp} XP</p>
        </div>

        {/* Badges */}
        <div className="card p-6 mb-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Badges</h2>
          {milestones.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No badges earned yet.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {milestones.map((m: Milestone) => (
                <div
                  key={m.id}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl bg-[var(--surface-elevated)]"
                >
                  <span className="text-2xl">{BADGE_ICONS[m.id] ?? "🏅"}</span>
                  <span className="text-[10px] text-[var(--muted)] text-center leading-tight">
                    {BADGE_NAMES[m.id] ?? m.id}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary stats (badges_stats+) */}
        {(visibility === "badges_stats" || visibility === "full_transparency") && publicData && (
          <div className="card p-6 mb-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Stats</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-[var(--accent)]">{publicData.streakLength ?? 0}</p>
                <p className="text-xs text-[var(--muted)]">Day Streak</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--accent)]">{publicData.weeksActive ?? 0}</p>
                <p className="text-xs text-[var(--muted)]">Weeks Active</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--accent)]">{publicData.macroHitRate ?? 0}%</p>
                <p className="text-xs text-[var(--muted)]">Macro Hit Rate</p>
              </div>
            </div>
          </div>
        )}

        {/* Accountability Mode (full_transparency) */}
        {visibility === "full_transparency" && publicData && (
          <>
            {publicData.recentMeals && publicData.recentMeals.length > 0 && (
              <div className="card p-6 mb-4">
                <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Recent Meals</h2>
                <div className="space-y-2">
                  {publicData.recentMeals.map((meal, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{meal.name}</p>
                        <p className="text-xs text-[var(--muted)]">{meal.date}</p>
                      </div>
                      <span className="text-xs text-[var(--muted)] whitespace-nowrap">
                        {meal.macros.calories} cal
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {publicData.workoutCompletionRate != null && (
              <div className="card p-6 mb-4">
                <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Workout Completion</h2>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-3 rounded-full bg-[var(--surface-elevated)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all"
                      style={{ width: `${publicData.workoutCompletionRate}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-[var(--accent)]">{publicData.workoutCompletionRate}%</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* CTA */}
        <div className="text-center mt-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-medium hover:opacity-90 transition"
          >
            Start your own journey on Recomp
          </a>
        </div>
      </div>
    </div>
  );
}
