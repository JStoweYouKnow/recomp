"use client";

import { useMemo } from "react";
import type { Goal, MetabolicModel, WearableDaySummary } from "@/lib/types";
import { assessDietPhase, dietPhaseLabel, type RateVerdict } from "@/lib/diet-phase";

const VERDICT_TONE: Record<RateVerdict, string> = {
  on_track: "text-[var(--accent)] bg-[var(--accent)]/10",
  too_fast: "text-[var(--accent-terracotta)] bg-[var(--accent-terracotta)]/10",
  too_slow: "text-[var(--accent-warm)] bg-[var(--accent-warm)]/10",
  stalled: "text-[var(--accent-warm)] bg-[var(--accent-warm)]/10",
  wrong_direction: "text-[var(--accent-terracotta)] bg-[var(--accent-terracotta)]/10",
};

const VERDICT_LABEL: Record<RateVerdict, string> = {
  on_track: "On track",
  too_fast: "Too fast",
  too_slow: "Too slow",
  stalled: "Stalled",
  wrong_direction: "Off course",
};

/**
 * Where the diet actually stands — trend weight, weekly rate, and what should change.
 *
 * The scale number people react to is mostly water. This shows the trend and judges the
 * *rate*, which is the part that decides whether the weight coming off is fat or muscle.
 */
export function DietPhaseCard({
  goal,
  weighIns,
  currentCalories,
  metabolicModel,
  weeksInDeficit,
}: {
  goal: Goal;
  weighIns: WearableDaySummary[];
  currentCalories: number;
  metabolicModel?: MetabolicModel | null;
  weeksInDeficit?: number;
}) {
  const assessment = useMemo(
    () =>
      assessDietPhase({
        goal,
        weighIns,
        currentCalories,
        estimatedTDEE: metabolicModel?.estimatedTDEE,
        tdeeConfidence: metabolicModel?.confidence,
        weeksInDeficit,
      }),
    [goal, weighIns, currentCalories, metabolicModel, weeksInDeficit],
  );

  const { trend } = assessment;
  if (trend.weighInCount === 0) return null;

  const rateLabel =
    trend.weeklyChangeLbs === 0
      ? "holding steady"
      : `${trend.weeklyChangeLbs > 0 ? "+" : "−"}${Math.abs(trend.weeklyChangeLbs).toFixed(1)} lb/week`;

  return (
    <section className="card-base p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)] bg-[var(--accent)]/10">
          {dietPhaseLabel(assessment.suggestedPhase ?? assessment.phase)}
        </span>
        {trend.reliable && (
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${VERDICT_TONE[assessment.rateVerdict]}`}
          >
            {VERDICT_LABEL[assessment.rateVerdict]}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">
            {trend.trendWeightLbs.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-[var(--muted)]">lb trend</span>
          </p>
          <p className="text-xs text-[var(--muted)]">
            Last weigh-in {trend.latestWeightLbs.toFixed(1)} lb · {rateLabel}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm font-medium leading-snug text-[var(--foreground)]">
        {assessment.headline}
      </p>

      {assessment.details.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {assessment.details.map((detail) => (
            <li key={detail} className="text-xs leading-snug text-[var(--muted)]">
              {detail}
            </li>
          ))}
        </ul>
      )}

      {assessment.calorieAdjustment !== 0 && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <p className="text-xs text-[var(--muted)]">Suggested target</p>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {currentCalories + assessment.calorieAdjustment} kcal/day
            <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">
              ({assessment.calorieAdjustment > 0 ? "+" : ""}
              {assessment.calorieAdjustment})
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
