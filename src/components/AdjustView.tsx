"use client";

import { useState, useEffect, useMemo } from "react";
import type { UserProfile, FitnessPlan, Macros, WeekdayKey } from "@/lib/types";
import {
  WEEKDAY_KEYS,
  WEEKDAY_SHORT,
  averageWeekdayTargets,
  effectiveWeekdayTargets,
  seedWeekdayTargetsFromPlan,
} from "@/lib/weekday-macros";
import { splitTrainingRestTargets } from "@/lib/macro-calculator";

const DEFAULT_TARGETS: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

export type TargetUpdate = {
  daily?: Macros;
  training?: Macros;
  rest?: Macros;
  weekdayTargets?: Record<WeekdayKey, Macros>;
};

function macroInputs(
  values: { cal: string; pro: string; carb: string; fat: string },
  setters: { setCal: (v: string) => void; setPro: (v: string) => void; setCarb: (v: string) => void; setFat: (v: string) => void },
) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: "Calories", min: 800, max: 5000, value: values.cal, set: setters.setCal, placeholder: "2000" },
        { label: "Protein (g)", min: 20, max: 400, value: values.pro, set: setters.setPro, placeholder: "150" },
        { label: "Carbs (g)", min: 0, max: 600, value: values.carb, set: setters.setCarb, placeholder: "200" },
        { label: "Fat (g)", min: 0, max: 200, value: values.fat, set: setters.setFat, placeholder: "65" },
      ].map(({ label, min, max, value, set, placeholder }) => (
        <div key={label}>
          <label className="label !mb-1">{label}</label>
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => set(e.target.value)}
            className="input-base w-full"
            placeholder={placeholder}
          />
        </div>
      ))}
    </div>
  );
}

function parseMacro(cal: string, pro: string, carb: string, fat: string): Macros | null {
  const c = Math.round(parseFloat(cal) || 0);
  const p = Math.round(parseFloat(pro) || 0);
  const cb = Math.round(parseFloat(carb) || 0);
  const f = Math.round(parseFloat(fat) || 0);
  if (c < 800 || c > 5000) return null;
  return {
    calories: Math.max(800, Math.min(5000, c)),
    protein: Math.max(20, Math.min(400, p)),
    carbs: Math.max(0, Math.min(600, cb)),
    fat: Math.max(0, Math.min(200, f)),
  };
}

function macrosToFields(m: Macros) {
  return {
    cal: String(m.calories),
    pro: String(m.protein),
    carb: String(m.carbs),
    fat: String(m.fat),
  };
}

export function AdjustView({
  plan,
  goal,
  unitSystem = "us",
  feedback,
  setFeedback,
  result,
  loading,
  onAdjust,
  onApplyAdjustments,
}: {
  plan: FitnessPlan | null;
  goal: UserProfile["goal"];
  unitSystem?: "us" | "metric";
  feedback: string;
  setFeedback: (s: string) => void;
  result: Record<string, unknown> | null;
  loading: boolean;
  onAdjust: () => void;
  onApplyAdjustments: (update: TargetUpdate) => void;
}) {
  const suggestion = result?.suggestion as { newTargets?: Macros; explanation?: string; changes?: string[] } | undefined;
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchSummary, setResearchSummary] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<WeekdayKey>("mon");
  const [saved, setSaved] = useState(false);

  const weekdayMap = useMemo(
    () => (plan ? effectiveWeekdayTargets(plan) : null),
    [plan]
  );

  const [fieldsByDay, setFieldsByDay] = useState<Record<WeekdayKey, { cal: string; pro: string; carb: string; fat: string }>>(
    () => {
      const init = {} as Record<WeekdayKey, { cal: string; pro: string; carb: string; fat: string }>;
      for (const key of WEEKDAY_KEYS) {
        init[key] = macrosToFields(DEFAULT_TARGETS);
      }
      return init;
    }
  );

  useEffect(() => {
    if (!weekdayMap) return;
    const next = {} as Record<WeekdayKey, { cal: string; pro: string; carb: string; fat: string }>;
    for (const key of WEEKDAY_KEYS) {
      next[key] = macrosToFields(weekdayMap[key]);
    }
    setFieldsByDay(next);
  }, [weekdayMap]);

  const activeFields = fieldsByDay[activeDay];

  const handleSaveWeek = () => {
    if (!plan) return;
    const merged = {} as Record<WeekdayKey, Macros>;
    for (const key of WEEKDAY_KEYS) {
      const f = fieldsByDay[key];
      const parsed = parseMacro(f.cal, f.pro, f.carb, f.fat);
      if (!parsed) return;
      merged[key] = parsed;
    }
    const avg = averageWeekdayTargets(merged);
    const { trainingTargets, restTargets } = splitTrainingRestTargets(avg);

    onApplyAdjustments({
      weekdayTargets: merged,
      daily: avg,
      training: trainingTargets,
      rest: restTargets,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fillFromWorkoutSchedule = () => {
    if (!plan) return;
    const base = plan.dietPlan.dailyTargets;
    const { trainingTargets, restTargets } = splitTrainingRestTargets(base);
    const seeded = seedWeekdayTargetsFromPlan(
      base,
      trainingTargets,
      restTargets,
      plan.workoutPlan?.weeklyPlan ?? []
    );
    const next = {} as Record<WeekdayKey, { cal: string; pro: string; carb: string; fat: string }>;
    for (const key of WEEKDAY_KEYS) {
      next[key] = macrosToFields(seeded[key]);
    }
    setFieldsByDay(next);
  };

  const handleGetLatestGuidance = async () => {
    const query = `latest evidence-based guidance for ${goal.replace("_", " ")} with muscle retention and fat loss`;
    setResearchLoading(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      const answer = (data.answer ?? data.error ?? "").toString();
      if (answer) {
        const trimmed = answer.slice(0, 260).trim();
        setResearchSummary(trimmed);
        const prefix = "Latest guidance context:";
        if (!feedback.includes(prefix)) {
          setFeedback(`${feedback}${feedback ? "\n\n" : ""}${prefix} ${trimmed}`);
        }
      }
    } catch {
      setResearchSummary("Could not load latest guidance right now.");
    } finally {
      setResearchLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="section-title !text-xl">Adjust your plan</h2>
        <p className="section-subtitle">Edit your targets or get AI suggestions based on your progress.</p>
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mt-0.5">Powered by Nova Lite</p>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Macro targets by day</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Set calories and macros for each day of the week (Mon–Sun). Meals and dashboard rings use the target for the day you are viewing.
        </p>

        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {WEEKDAY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveDay(key)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeDay === key
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {WEEKDAY_SHORT[key]}
            </button>
          ))}
        </div>

        <p className="text-xs text-[var(--muted)] mb-3">
          Editing <strong className="text-[var(--foreground)]">{WEEKDAY_SHORT[activeDay]}</strong>. Saving updates your full weekly map and refreshes the plan average.
        </p>

        {macroInputs(
          { cal: activeFields.cal, pro: activeFields.pro, carb: activeFields.carb, fat: activeFields.fat },
          {
            setCal: (v) => setFieldsByDay((prev) => ({ ...prev, [activeDay]: { ...prev[activeDay], cal: v } })),
            setPro: (v) => setFieldsByDay((prev) => ({ ...prev, [activeDay]: { ...prev[activeDay], pro: v } })),
            setCarb: (v) => setFieldsByDay((prev) => ({ ...prev, [activeDay]: { ...prev[activeDay], carb: v } })),
            setFat: (v) => setFieldsByDay((prev) => ({ ...prev, [activeDay]: { ...prev[activeDay], fat: v } })),
          }
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={handleSaveWeek} disabled={!plan} className="btn-primary">
            {saved ? "Saved" : "Save weekly targets"}
          </button>
          <button
            type="button"
            onClick={fillFromWorkoutSchedule}
            disabled={!plan}
            className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
          >
            Fill from workout schedule
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-2">AI adjustment</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Describe how you are feeling, what is working, or what you want to change. The Ref will suggest updated targets.
        </p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. I'm losing too fast, energy is low on training days…"
          className="input-base w-full min-h-[100px] mb-3"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAdjust} disabled={loading || !feedback.trim()} className="btn-primary">
            {loading ? "Thinking…" : "Get AI suggestion"}
          </button>
          <button
            type="button"
            onClick={handleGetLatestGuidance}
            disabled={researchLoading}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface-elevated)] disabled:opacity-50"
          >
            {researchLoading ? "Loading…" : "Add latest guidance"}
          </button>
        </div>
        {researchSummary && (
          <p className="mt-3 text-xs text-[var(--muted)] border-l-2 border-[var(--accent)] pl-3">{researchSummary}</p>
        )}
        {suggestion?.newTargets && (
          <div className="mt-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-4 space-y-2">
            <p className="text-sm font-medium">Suggested base targets</p>
            {suggestion.explanation && <p className="text-sm text-[var(--muted)]">{suggestion.explanation}</p>}
            <p className="text-sm tabular-nums">
              {suggestion.newTargets.calories} cal · {suggestion.newTargets.protein}g P · {suggestion.newTargets.carbs}g C ·{" "}
              {suggestion.newTargets.fat}g F
            </p>
            <button
              type="button"
              className="text-sm text-[var(--accent)] hover:underline"
              onClick={() => {
                if (!plan || !suggestion.newTargets) return;
                const { trainingTargets, restTargets } = splitTrainingRestTargets(suggestion.newTargets);
                const seeded = seedWeekdayTargetsFromPlan(
                  suggestion.newTargets,
                  trainingTargets,
                  restTargets,
                  plan.workoutPlan?.weeklyPlan ?? []
                );
                onApplyAdjustments({
                  daily: suggestion.newTargets,
                  training: trainingTargets,
                  rest: restTargets,
                  weekdayTargets: seeded,
                });
              }}
            >
              Apply suggestion to plan
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Units: {unitSystem === "metric" ? "metric" : "US"}. Training/rest presets remain on the plan for older app versions; day-of-week targets take priority when set.
      </p>
    </div>
  );
}
