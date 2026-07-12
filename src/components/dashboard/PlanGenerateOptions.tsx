"use client";

import type { RegeneratePlanOptions } from "@/lib/multi-week-plan";

const PROGRAM_LENGTH_OPTIONS = [1, 4, 8, 12] as const;

type PlanGenerateOptionsProps = {
  programWeeks: number;
  workoutDaysPerWeek: number;
  onProgramWeeksChange: (weeks: number) => void;
  onWorkoutDaysPerWeekChange: (days: number) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function PlanGenerateOptions({
  programWeeks,
  workoutDaysPerWeek,
  onProgramWeeksChange,
  onWorkoutDaysPerWeekChange,
  disabled = false,
  compact = false,
}: PlanGenerateOptionsProps) {
  return (
    <div className={compact ? "space-y-3 text-left" : "space-y-4 text-left max-w-sm mx-auto"}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">Program length</p>
        <div className="flex flex-wrap gap-2 justify-center" role="group" aria-label="Program length">
          {PROGRAM_LENGTH_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              disabled={disabled}
              onClick={() => onProgramWeeksChange(w)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                programWeeks === w
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-elevated)] text-[var(--foreground)] hover:bg-[var(--border-soft)]"
              }`}
            >
              {w === 1 ? "1 week" : `${w} weeks`}
            </button>
          ))}
        </div>
        {programWeeks > 1 && (
          <p className="text-xs text-[var(--muted)] mt-2 text-center">
            Multi-week programs build in chunks and may take a few minutes.
          </p>
        )}
      </div>
      <div>
        <label htmlFor="plan-days-per-week" className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] block mb-2">
          Training days per week
        </label>
        <select
          id="plan-days-per-week"
          disabled={disabled}
          value={workoutDaysPerWeek}
          onChange={(e) => onWorkoutDaysPerWeekChange(Number(e.target.value))}
          className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          {[2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function planOptionsFromState(
  programWeeks: number,
  workoutDaysPerWeek: number
): RegeneratePlanOptions {
  return {
    programWeeks: programWeeks > 1 ? programWeeks : undefined,
    workoutDaysPerWeek,
  };
}

export function defaultWorkoutDaysPerWeek(profileDays?: number): number {
  const d = profileDays ?? 4;
  return Math.min(7, Math.max(2, Math.round(d)));
}
