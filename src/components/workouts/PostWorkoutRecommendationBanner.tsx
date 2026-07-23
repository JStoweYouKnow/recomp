"use client";

import { useState } from "react";
import { processRicoActions, formatRicoApplyStatus } from "@/lib/rico-actions";
import type { RegeneratePlanOptions } from "@/lib/multi-week-plan";

export interface PostWorkoutRecommendationData {
  reply: string;
  actions: { type: string; payload: Record<string, unknown> }[];
  completedSession: {
    day: string;
    focus: string;
    exerciseCount: number;
  };
  nextWorkout?: {
    day: string;
    focus: string;
    scheduledDate: string | null;
  };
}

export function PostWorkoutRecommendationBanner({
  recommendation,
  onDismiss,
  onRegeneratePlan,
  onApplied,
}: {
  recommendation: PostWorkoutRecommendationData;
  onDismiss: () => void;
  onRegeneratePlan?: (options?: RegeneratePlanOptions) => Promise<void>;
  onApplied?: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  const hasPlanActions = recommendation.actions.some((a) =>
    ["swap_exercise", "add_exercise", "update_workout_day", "regenerate_plan", "adjust_program_start"].includes(a.type),
  );

  const applyRecommendations = async () => {
    if (recommendation.actions.length === 0) return;
    setApplying(true);
    try {
      const result = processRicoActions(recommendation.actions);
      if (result.regeneratePlan && onRegeneratePlan) {
        await onRegeneratePlan(result.regeneratePlanOptions);
      }
      if (result.changed) {
        setAppliedMessage(formatRicoApplyStatus(result));
        onApplied?.();
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Workout complete — Ref&apos;s take
          </p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {recommendation.completedSession.focus} · {recommendation.completedSession.exerciseCount} exercises
            {recommendation.nextWorkout
              ? ` · Next up: ${recommendation.nextWorkout.day} (${recommendation.nextWorkout.focus})`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          aria-label="Dismiss recommendation"
        >
          ×
        </button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
        {recommendation.reply}
      </p>
      {appliedMessage && (
        <p className="mt-2 text-xs text-[var(--accent)]">{appliedMessage}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {hasPlanActions && !appliedMessage && (
          <button
            type="button"
            onClick={applyRecommendations}
            disabled={applying}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {applying ? "Applying…" : "Apply plan changes"}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--card)]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
