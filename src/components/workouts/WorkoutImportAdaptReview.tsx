"use client";

import { useMemo, useState } from "react";
import type { WorkoutAdaptSwap, WorkoutDay } from "@/lib/types";

export interface WorkoutImportAdaptReviewProps {
  swaps: WorkoutAdaptSwap[];
  workout?: WorkoutDay | null;
  programDays?: WorkoutDay[] | null;
  programTitle?: string | null;
  stats?: { learnedApplied: number; catalogApplied: number; llmApplied: number };
  onSwapsChange: (swaps: WorkoutAdaptSwap[]) => void;
  onAccept: () => void;
  onCancel: () => void;
  acceptLabel?: string;
  loading?: boolean;
}

function swapKey(swap: WorkoutAdaptSwap, index: number): string {
  return `${swap.dayLabel ?? ""}-${swap.section}-${swap.index}-${index}`;
}

export function WorkoutImportAdaptReview({
  swaps,
  workout,
  programDays,
  programTitle,
  stats,
  onSwapsChange,
  onAccept,
  onCancel,
  acceptLabel = "Import with adjustments",
  loading = false,
}: WorkoutImportAdaptReviewProps) {
  const actionableSwaps = useMemo(
    () => swaps.filter((s) => s.source !== "none" && s.original !== s.replacement),
    [swaps]
  );
  const unresolved = useMemo(
    () => swaps.filter((s) => s.source === "none"),
    [swaps]
  );

  const updateReplacement = (index: number, replacement: string) => {
    const next = swaps.map((s, i) => (i === index ? { ...s, replacement } : s));
    onSwapsChange(next);
  };

  const dayCount = programDays?.length ?? (workout ? 1 : 0);

  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">
          {programTitle
            ? `Equipment review — ${programTitle}`
            : workout
              ? `Equipment review — ${workout.day}`
              : "Equipment review"}
        </p>
        <p className="text-xs text-[var(--muted)] mt-1">
          {actionableSwaps.length > 0
            ? `${actionableSwaps.length} exercise${actionableSwaps.length === 1 ? "" : "s"} adjusted for your equipment. Edits you accept are remembered for future imports.`
            : unresolved.length > 0
              ? `${unresolved.length} exercise${unresolved.length === 1 ? "" : "s"} may not match your equipment — review before importing.`
              : `All ${dayCount} session${dayCount === 1 ? "" : "s"} match your equipment.`}
        </p>
        {stats && (stats.learnedApplied > 0 || stats.catalogApplied > 0 || stats.llmApplied > 0) && (
          <p className="text-[10px] text-[var(--muted)] mt-1">
            {stats.learnedApplied > 0 && `${stats.learnedApplied} from your saved swaps`}
            {stats.learnedApplied > 0 && stats.catalogApplied > 0 && " · "}
            {stats.catalogApplied > 0 && `${stats.catalogApplied} catalog`}
            {(stats.learnedApplied > 0 || stats.catalogApplied > 0) && stats.llmApplied > 0 && " · "}
            {stats.llmApplied > 0 && `${stats.llmApplied} AI suggested`}
          </p>
        )}
      </div>

      {swaps.length > 0 && (
        <ul className="space-y-2 max-h-56 overflow-y-auto">
          {swaps.map((swap, index) => (
            <li
              key={swapKey(swap, index)}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[var(--muted)] line-through">{swap.original}</span>
                <span aria-hidden>→</span>
                {swap.source === "none" ? (
                  <span className="font-medium text-[var(--foreground)]">{swap.replacement}</span>
                ) : (
                  <input
                    type="text"
                    value={swap.replacement}
                    onChange={(e) => updateReplacement(index, e.target.value)}
                    className="flex-1 min-w-[8rem] rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
                  />
                )}
              </div>
              <p className="text-[10px] text-[var(--muted)] mt-1">
                {swap.reason}
                {swap.dayLabel ? ` · ${swap.dayLabel}` : ""}
                {swap.source === "learned" ? " · saved" : swap.source === "catalog" ? " · catalog" : swap.source === "llm" ? " · AI" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={loading}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {loading ? "Saving…" : acceptLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="text-xs text-[var(--muted)] hover:underline self-center"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Apply edited swaps onto a workout day (mirrors server adapt output). */
export function applySwapsToWorkoutDay(day: WorkoutDay, swaps: WorkoutAdaptSwap[]): WorkoutDay {
  const next = {
    ...day,
    warmups: [...(day.warmups ?? [])],
    exercises: [...day.exercises],
    finishers: [...(day.finishers ?? [])],
  };
  for (const swap of swaps) {
    if (swap.dayLabel && swap.dayLabel !== day.day) continue;
    const list =
      swap.section === "warmups"
        ? next.warmups!
        : swap.section === "finishers"
          ? next.finishers!
          : next.exercises;
    const ex = list[swap.index];
    if (!ex) continue;
    list[swap.index] = {
      ...ex,
      name: swap.replacement.trim() || ex.name,
    };
  }
  return next;
}

export function applySwapsToProgram(days: WorkoutDay[], swaps: WorkoutAdaptSwap[]): WorkoutDay[] {
  return days.map((day) => applySwapsToWorkoutDay(day, swaps.filter((s) => !s.dayLabel || s.dayLabel === day.day)));
}
