"use client";

import { useState, useEffect } from "react";
import { getOrCreateTodayQuests, updateQuestProgress, saveQuests, getQuestsXpEarned, type DailyQuest } from "@/lib/quests";
import { getTodayLocal } from "@/lib/date-utils";
import { getHydration, getBiofeedback, getRicoHistory } from "@/lib/storage";
import { playQuestComplete } from "@/lib/sounds";

interface DailyQuestsCardProps {
  todayMealCount: number;
  workoutCompleted: boolean;
  onXpEarned?: (xp: number) => void;
}

export function DailyQuestsCard({ todayMealCount, workoutCompleted, onXpEarned }: DailyQuestsCardProps) {
  const [quests, setQuests] = useState<DailyQuest[]>(() => getOrCreateTodayQuests());
  const [prevCompleted, setPrevCompleted] = useState<Set<string>>(() =>
    new Set(getOrCreateTodayQuests().filter((x) => x.completed).map((x) => x.id))
  );

  useEffect(() => {
    if (quests.length === 0) return;
    const today = getTodayLocal();

    const hydration = getHydration();
    const todayHydration = hydration.filter((e) => e.date === today);
    const hydrationGlasses = Math.floor(todayHydration.reduce((s, e) => s + e.amountMl, 0) / 250);

    const bio = getBiofeedback();
    const biofeedbackLogged = bio.some((e) => e.date === today);

    const rico = getRicoHistory();
    const ricoToday = rico.filter((m) => m.role === "user" && m.at?.startsWith(today)).length;

    const updated = updateQuestProgress(quests, {
      todayMealCount,
      workoutCompleted,
      ricoMessagesToday: ricoToday,
      hydrationGlasses,
      biofeedbackLogged,
    });

    // Check for newly completed quests
    const newlyCompleted = updated.filter((q) => q.completed && !prevCompleted.has(q.id));
    if (newlyCompleted.length > 0) {
      playQuestComplete();
      queueMicrotask(() =>
        setPrevCompleted(new Set(updated.filter((q) => q.completed).map((q) => q.id)))
      );
    }

    saveQuests(today, updated);
    const xp = getQuestsXpEarned(updated);
    if (xp > 0 && onXpEarned) onXpEarned(xp);
    queueMicrotask(() => setQuests(updated));
  }, [todayMealCount, workoutCompleted]);

  const allComplete = quests.every((q) => q.completed);
  const completedCount = quests.filter((q) => q.completed).length;

  const QUEST_ICONS: Record<string, string> = {
    log_meals: "\ud83c\udf7d\ufe0f",
    complete_workout: "\ud83d\udcaa",
    ask_reco: "\ud83d\udcac",
    log_water: "\ud83d\udca7",
    log_biofeedback: "\ud83e\udde0",
  };

  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            ⚔️
          </span>
          <h3 className="text-h6 font-semibold">Daily Quests</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--muted)]">
            {completedCount}/{quests.length}
          </span>
          {allComplete && (
            <span className="badge badge-accent text-[10px]">
              +50 bonus XP
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {quests.map((q) => (
          <div
            key={q.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
              q.completed
                ? "bg-[var(--accent-10)] border border-[var(--accent)]/20"
                : "bg-[var(--surface)] border border-transparent"
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-all ${
                q.completed ? "quest-check" : ""
              }`}
            >
              {q.completed ? "\u2705" : QUEST_ICONS[q.type] || "\u2b50"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm font-medium ${
                    q.completed ? "line-through text-[var(--muted)]" : "text-[var(--foreground)]"
                  }`}
                >
                  {q.title}
                </span>
                <span className="text-xs text-[var(--accent)] font-medium ml-2">
                  +{q.xpReward} XP
                </span>
              </div>
              <div className="mt-1">
                <div className="progress-track !h-[4px] !mt-0">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, (q.progress / q.target) * 100)}%`,
                      background: q.completed ? "var(--accent)" : "var(--accent-warm)",
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">
                {q.description} ({q.progress}/{q.target})
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
