"use client";

import type { WorkoutExercise, WorkoutSetLog } from "@/lib/types";
import {
  buildWorkoutSetLog,
  logsForExerciseOnDate,
  parseSetCount,
  removeWorkoutSetLog,
  upsertWorkoutSetLog,
  workoutSetLogId,
  type WorkoutSetSection,
} from "@/lib/workout-set-logs";

type SetDraft = { weightLbs: string; reps: string; rpe: string; done: boolean };

function parseRepsDefault(reps: string): string {
  const m = reps.match(/\d+/);
  return m ? m[0] : "";
}

export function ExerciseSetPerformanceGrid({
  planId,
  date,
  dayLabel,
  section,
  exercise,
  globalSlot,
  setLogs,
  disabled,
  onLogsChange,
  onAllSetsCompleteChange,
}: {
  planId: string;
  date: string;
  dayLabel: string;
  section: WorkoutSetSection;
  exercise: WorkoutExercise;
  globalSlot: number;
  setLogs: WorkoutSetLog[];
  disabled?: boolean;
  onLogsChange: (logs: WorkoutSetLog[]) => void;
  onAllSetsCompleteChange?: (complete: boolean) => void;
}) {
  const setCount = parseSetCount(exercise.sets);
  const existing = logsForExerciseOnDate(setLogs, planId, date, dayLabel, section, exercise.name, globalSlot);

  const drafts: SetDraft[] = Array.from({ length: setCount }, (_, setIndex) => {
    const log = existing.find((l) => l.setIndex === setIndex);
    return {
      weightLbs: log?.weightLbs != null ? String(log.weightLbs) : "",
      reps: log?.reps != null ? String(log.reps) : parseRepsDefault(exercise.reps),
      rpe: log?.rpe != null ? String(log.rpe) : "",
      done: Boolean(log),
    };
  });

  const applySet = (setIndex: number, patch: Partial<SetDraft>) => {
    const nextDrafts = drafts.map((d, i) => (i === setIndex ? { ...d, ...patch } : d));
    let nextLogs = [...setLogs];

    for (let i = 0; i < nextDrafts.length; i++) {
      const d = nextDrafts[i];
      const id = workoutSetLogId({
        planId,
        date,
        dayLabel,
        section,
        exerciseName: exercise.name,
        globalSlot,
        setIndex: i,
      });
      if (!d.done) {
        nextLogs = removeWorkoutSetLog(nextLogs, id);
        continue;
      }
      const weight = d.weightLbs.trim() ? Number(d.weightLbs) : undefined;
      const reps = d.reps.trim() ? parseInt(d.reps, 10) : undefined;
      const rpe = d.rpe.trim() ? Number(d.rpe) : undefined;
      nextLogs = upsertWorkoutSetLog(
        nextLogs,
        buildWorkoutSetLog({
          planId,
          date,
          dayLabel,
          section,
          exercise,
          globalSlot,
          setIndex: i,
          weightLbs: Number.isFinite(weight) ? weight : undefined,
          reps: Number.isFinite(reps) ? reps : undefined,
          rpe: Number.isFinite(rpe) ? rpe : undefined,
        }),
      );
    }

    onLogsChange(nextLogs);
    const allDone = nextDrafts.every((d) => d.done);
    onAllSetsCompleteChange?.(allDone);
  };

  return (
    <div className="mt-2 space-y-1.5">
      {drafts.map((draft, setIndex) => (
        <div key={setIndex} className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1.5 min-w-[52px]">
            <input
              type="checkbox"
              checked={draft.done}
              disabled={disabled}
              onChange={(e) => applySet(setIndex, { done: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
              aria-label={`Set ${setIndex + 1} complete`}
            />
            <span className="text-[var(--muted)]">Set {setIndex + 1}</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="lbs"
            value={draft.weightLbs}
            disabled={disabled}
            onChange={(e) => applySet(setIndex, { weightLbs: e.target.value, done: true })}
            className="input-base w-16 rounded px-2 py-1"
            aria-label={`Set ${setIndex + 1} weight`}
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="reps"
            value={draft.reps}
            disabled={disabled}
            onChange={(e) => applySet(setIndex, { reps: e.target.value, done: true })}
            className="input-base w-14 rounded px-2 py-1"
            aria-label={`Set ${setIndex + 1} reps`}
          />
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={10}
            step={0.5}
            placeholder="RPE"
            value={draft.rpe}
            disabled={disabled}
            onChange={(e) => applySet(setIndex, { rpe: e.target.value, done: draft.done || Boolean(e.target.value) })}
            className="input-base w-12 rounded px-2 py-1"
            aria-label={`Set ${setIndex + 1} RPE`}
          />
        </div>
      ))}
    </div>
  );
}
