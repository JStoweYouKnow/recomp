"use client";

import { useMemo, useState } from "react";
import type { FitnessPlan, ScheduleAction } from "@/lib/types";
import {
  applyScheduleAction,
  countRecentMissed,
  dismissCatchUpBanner,
  shouldShowCatchUpBanner,
} from "@/lib/workout-schedule";

interface CatchUpBannerProps {
  plan: FitnessPlan;
  progress: Record<string, string>;
  today: string;
  onUpdatePlan: (plan: FitnessPlan) => void;
  onSync?: () => void;
  showToast?: (msg: string) => void;
}

export function CatchUpBanner({ plan, progress, today, onUpdatePlan, onSync, showToast }: CatchUpBannerProps) {
  const [loading, setLoading] = useState<ScheduleAction | "ai" | null>(null);

  const visible = useMemo(() => shouldShowCatchUpBanner(plan, progress, today), [plan, progress, today]);
  const missedCount = useMemo(() => countRecentMissed(plan, progress, 7, today), [plan, progress, today]);

  if (!visible) return null;

  const apply = async (action: ScheduleAction, useAi = false) => {
    setLoading(useAi ? "ai" : action);
    try {
      if (useAi) {
        const res = await fetch("/api/plans/adjust-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan,
            workoutProgress: progress,
            useAiRecommendation: true,
            today,
          }),
        });
        if (!res.ok) throw new Error("Schedule adjustment failed");
        const data = (await res.json()) as { workoutPlan: FitnessPlan["workoutPlan"]; summary: string };
        onUpdatePlan({ ...plan, workoutPlan: data.workoutPlan });
        showToast?.(data.summary);
      } else {
        const result = applyScheduleAction(plan, action, progress, { today });
        onUpdatePlan({ ...plan, workoutPlan: result.workoutPlan });
        showToast?.(result.summary);
      }
      onSync?.();
    } catch {
      showToast?.("Could not update your schedule. Try again.");
    } finally {
      setLoading(null);
    }
  };

  const dismiss = () => {
    onUpdatePlan(dismissCatchUpBanner(plan));
    onSync?.();
  };

  const isMultiWeek = Boolean(plan.workoutPlan.programWeek1Start && plan.workoutPlan.weeklyPlan.length > 7);

  return (
    <div
      className="mb-4 rounded-xl border border-[var(--warm)]/40 bg-[var(--warm)]/10 p-4"
      role="region"
      aria-label="Missed workout catch-up"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-[var(--foreground)]">You missed {missedCount} workout sessions this week</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isMultiWeek
              ? "Your program week may have moved ahead. Choose how to get back on track."
              : "Pick whether to catch up, skip ahead, or repeat last week."}
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          onClick={dismiss}
          aria-label="Dismiss for today"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {isMultiWeek && (
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={loading !== null}
            onClick={() => apply("stay_on_week")}
          >
            {loading === "stay_on_week" ? "Updating…" : "Stay on current week"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={loading !== null}
          onClick={() => apply("catch_up")}
        >
          {loading === "catch_up" ? "Updating…" : "Catch up later"}
        </button>
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={loading !== null}
          onClick={() => apply("skip_week")}
        >
          {loading === "skip_week" ? "Updating…" : "Skip & continue"}
        </button>
        <button
          type="button"
          className="btn btn-primary text-sm"
          disabled={loading !== null}
          onClick={() => apply("catch_up", true)}
        >
          {loading === "ai" ? "Asking coach…" : "Ask coach"}
        </button>
      </div>
    </div>
  );
}
