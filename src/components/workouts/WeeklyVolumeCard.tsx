"use client";

import { useMemo } from "react";
import type { WorkoutSetLog } from "@/lib/types";
import {
  computeWeeklyVolume,
  muscleLabel,
  type MuscleVolumeEntry,
  type VolumeStatus,
} from "@/lib/muscle-volume";

const STATUS_STYLE: Record<VolumeStatus, { bar: string; label: string; text: string }> = {
  under: { bar: "bg-[var(--accent-warm)]", label: "Below minimum", text: "text-[var(--accent-warm)]" },
  optimal: { bar: "bg-[var(--accent)]", label: "On target", text: "text-[var(--accent)]" },
  high: { bar: "bg-[var(--accent-sage)]", label: "High", text: "text-[var(--accent)]" },
  over: { bar: "bg-[var(--accent-terracotta)]", label: "Over max", text: "text-[var(--accent-terracotta)]" },
};

function VolumeRow({ entry }: { entry: MuscleVolumeEntry }) {
  const style = STATUS_STYLE[entry.status];
  // Bar is scaled against MRV so all groups share one visual scale.
  const pct = Math.min(100, (entry.sets / entry.landmarks.mrv) * 100);
  const mevPct = Math.min(100, (entry.landmarks.mev / entry.landmarks.mrv) * 100);

  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--foreground)]">{muscleLabel(entry.muscle)}</span>
        <span className="text-xs tabular-nums text-[var(--muted)]">
          <span className={`font-semibold ${style.text}`}>{entry.sets}</span>
          <span className="mx-0.5">/</span>
          {entry.landmarks.mev}–{entry.landmarks.mrv} sets
        </span>
      </div>
      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-elevated)]">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${pct}%` }} />
        {/* MEV marker — the line that must be cleared for the work to count. */}
        <div
          className="absolute top-0 h-full w-px bg-[var(--border)]"
          style={{ left: `${mevPct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/**
 * Hard sets per muscle this week against MEV/MRV landmarks.
 *
 * This is the number that most often explains a stalled physique: the scale moves,
 * lifts climb, but a group like hamstrings or rear delts never clears its minimum.
 */
export function WeeklyVolumeCard({
  setLogs,
  weekStart,
  fitnessLevel,
  muscleLookup,
}: {
  setLogs: WorkoutSetLog[];
  weekStart: string;
  fitnessLevel?: string;
  muscleLookup?: Record<string, string[]>;
}) {
  const summary = useMemo(
    () => computeWeeklyVolume(setLogs, weekStart, { fitnessLevel, muscleLookup }),
    [setLogs, weekStart, fitnessLevel, muscleLookup],
  );

  if (summary.totalHardSets === 0) return null;

  // Trained groups first; untouched groups collapse into a single trailing note.
  const trained = summary.entries.filter((e) => e.sets > 0);
  const untouched = summary.entries.filter((e) => e.sets === 0);

  return (
    <section className="card-base p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Weekly volume</h3>
        <span className="text-xs text-[var(--muted)]">{summary.totalHardSets} hard sets</span>
      </div>

      <div className="mt-2 divide-y divide-[var(--border-soft)]">
        {trained.map((entry) => (
          <VolumeRow key={entry.muscle} entry={entry} />
        ))}
      </div>

      {summary.overdosed.length > 0 && (
        <p className="mt-3 text-xs text-[var(--accent-terracotta)]">
          Past the recoverable ceiling: {summary.overdosed.map(muscleLabel).join(", ")}. Trim sets here
          rather than adding more.
        </p>
      )}

      {untouched.length > 0 && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          No sets logged this week: {untouched.map((e) => muscleLabel(e.muscle)).join(", ")}.
        </p>
      )}

      {summary.unclassifiedExercises.length > 0 && (
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Not counted (unrecognized): {summary.unclassifiedExercises.join(", ")}
        </p>
      )}
    </section>
  );
}
