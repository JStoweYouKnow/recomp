"use client";

import { useState, useEffect } from "react";
import type { UserProfile, MealEntry } from "@/lib/types";
import { getBiofeedback, getCoachSchedule, saveCoachSchedule, getMeals, getWorkoutProgress } from "@/lib/storage";
import { syncToServer } from "@/lib/storage";
import { getTodayLocal } from "@/lib/date-utils";
import { v4 as uuidv4 } from "uuid";

interface CoachCheckInCardProps {
  profile: UserProfile;
  todayMeals: MealEntry[];
  targets: { calories: number; protein: number };
  workoutCompletedToday: boolean;
  streak: number;
}

export function CoachCheckInCard({
  profile,
  todayMeals,
  targets,
  workoutCompletedToday,
  streak,
}: CoachCheckInCardProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"encouraging" | "neutral" | "confrontational" | null>(null);
  const [loading, setLoading] = useState(false);
  const [confrontLoading, setConfrontLoading] = useState(false);
  const [confrontations, setConfrontations] = useState<{ id: string; date: string; pattern: string; message: string; acknowledged: boolean }[]>([]);

  useEffect(() => {
    const s = getCoachSchedule();
    setConfrontations(s?.confrontations?.filter((c) => !c.acknowledged) ?? []);
  }, [message]);

  const fetchCheckIn = async () => {
    setLoading(true);
    try {
      const biofeedback = getBiofeedback();
      const latest = biofeedback.filter((e) => e.date === getTodayLocal()).sort((a, b) => b.time.localeCompare(a.time))[0];
      const res = await fetch("/api/coach/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          todayMeals: todayMeals.length,
          todayTargets: targets,
          workoutCompleted: workoutCompletedToday,
          streak,
          biofeedback: latest ? { energy: latest.energy, mood: latest.mood, hunger: latest.hunger, stress: latest.stress, soreness: latest.soreness } : null,
        }),
      });
      const data = await res.json();
      setMessage(data.message ?? "How's your day going?");
      setTone(data.tone ?? "neutral");
    } catch {
      setMessage("Keep pushing! You've got this.");
      setTone("encouraging");
    } finally {
      setLoading(false);
    }
  };

  const requestConfrontation = async () => {
    setConfrontLoading(true);
    try {
      const meals = getMeals();
      const workoutProgress = getWorkoutProgress();
      const today = getTodayLocal();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const recentMeals = meals.filter((m) => m.date >= weekAgo);
      const mealDates = new Set(recentMeals.map((m) => m.date));
      const patterns: string[] = [];
      if (mealDates.size < 4) patterns.push(`Only ${mealDates.size} days with meals logged in the past week`);
      if (streak === 0 && todayMeals.length === 0) patterns.push("No meals logged today, streak broken");
      if (!workoutCompletedToday && Object.keys(workoutProgress).length < 3) patterns.push("Few or no workouts completed recently");
      const res = await fetch("/api/coach/confront", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, patterns: patterns.length ? patterns : ["General check-in needed"] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const s = getCoachSchedule();
      const confrontation = {
        id: uuidv4(),
        date: today,
        pattern: data.pattern ?? "Pattern",
        message: data.message ?? "Let's check in.",
        acknowledged: false,
      };
      const next = {
        ...(s ?? { checkInTimes: ["09:00"], lastCheckIn: new Date().toISOString(), confrontations: [], weeklyReviewDay: 0 }),
        confrontations: [...(s?.confrontations ?? []), confrontation],
      };
      saveCoachSchedule(next);
      syncToServer();
      setConfrontations([...confrontations, confrontation]);
    } catch {
      // silent
    } finally {
      setConfrontLoading(false);
    }
  };

  const acknowledgeConfrontation = (id: string) => {
    const s = getCoachSchedule();
    if (!s) return;
    const next = {
      ...s,
      confrontations: s.confrontations.map((c) => (c.id === id ? { ...c, acknowledged: true } : c)),
    };
    saveCoachSchedule(next);
    syncToServer();
    setConfrontations(next.confrontations.filter((c) => !c.acknowledged));
  };

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
      <h4 className="text-sm font-semibold">Coach Check-In</h4>
      {confrontations.length > 0 && (
        <div className="space-y-2 rounded-lg border border-[var(--accent-terracotta)]/30 bg-[var(--accent-terracotta)]/5 p-2">
          <p className="text-xs font-medium text-[var(--accent-terracotta)]">Needs attention</p>
          {confrontations.map((c) => (
            <div key={c.id} className="text-xs">
              <p className="text-[var(--foreground)]">{c.message}</p>
              <button
                type="button"
                onClick={() => acknowledgeConfrontation(c.id)}
                className="mt-1 text-[var(--accent)] hover:underline"
              >
                Acknowledge
              </button>
            </div>
          ))}
        </div>
      )}
      {message ? (
        <p className={`text-sm ${tone === "confrontational" ? "text-[var(--accent-terracotta)]" : tone === "encouraging" ? "text-[var(--accent)]" : ""}`}>
          {message}
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">Get a personalized message from The Ref</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={fetchCheckIn}
          disabled={loading}
          className="btn-secondary text-xs flex-1 py-2"
        >
          {loading ? "..." : message ? "Refresh" : "Get check-in"}
        </button>
        <button
          type="button"
          onClick={requestConfrontation}
          disabled={confrontLoading}
          className="rounded-lg border border-[var(--accent-terracotta)]/40 px-2 py-2 text-xs text-[var(--accent-terracotta)] hover:bg-[var(--accent-terracotta)]/10 disabled:opacity-50"
          title="Get a direct wake-up call about your patterns"
        >
          {confrontLoading ? "…" : "Wake-up call"}
        </button>
      </div>
    </div>
  );
}
