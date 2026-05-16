"use client";

import { useState, useEffect } from "react";
import type { UserProfile, FitnessPlan, Macros } from "@/lib/types";

const DEFAULT_TARGETS: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 };
const CAL_SWING = 200;
const CARB_SWING = 50;

export type TargetUpdate = { daily?: Macros; training?: Macros; rest?: Macros };
type TargetMode = "base" | "training" | "rest";

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
  const [activeTab, setActiveTab] = useState<TargetMode>("base");
  const [savedTab, setSavedTab] = useState<TargetMode | null>(null);

  const base = plan?.dietPlan?.dailyTargets ?? DEFAULT_TARGETS;
  const training = plan?.dietPlan?.trainingTargets ?? { ...base, calories: base.calories + CAL_SWING, carbs: base.carbs + CARB_SWING };
  const rest = plan?.dietPlan?.restTargets ?? { ...base, calories: base.calories - CAL_SWING, carbs: Math.max(0, base.carbs - CARB_SWING) };

  const [baseCal, setBaseCal] = useState(String(base.calories));
  const [basePro, setBasePro] = useState(String(base.protein));
  const [baseCarb, setBaseCarb] = useState(String(base.carbs));
  const [baseFat, setBaseFat] = useState(String(base.fat));

  const [trainCal, setTrainCal] = useState(String(training.calories));
  const [trainPro, setTrainPro] = useState(String(training.protein));
  const [trainCarb, setTrainCarb] = useState(String(training.carbs));
  const [trainFat, setTrainFat] = useState(String(training.fat));

  const [restCal, setRestCal] = useState(String(rest.calories));
  const [restPro, setRestPro] = useState(String(rest.protein));
  const [restCarb, setRestCarb] = useState(String(rest.carbs));
  const [restFat, setRestFat] = useState(String(rest.fat));

  useEffect(() => {
    setBaseCal(String(base.calories)); setBasePro(String(base.protein));
    setBaseCarb(String(base.carbs)); setBaseFat(String(base.fat));
  }, [base.calories, base.protein, base.carbs, base.fat]);

  useEffect(() => {
    setTrainCal(String(training.calories)); setTrainPro(String(training.protein));
    setTrainCarb(String(training.carbs)); setTrainFat(String(training.fat));
  }, [training.calories, training.protein, training.carbs, training.fat]);

  useEffect(() => {
    setRestCal(String(rest.calories)); setRestPro(String(rest.protein));
    setRestCarb(String(rest.carbs)); setRestFat(String(rest.fat));
  }, [rest.calories, rest.protein, rest.carbs, rest.fat]);

  const handleSave = (tab: TargetMode) => {
    let update: TargetUpdate = {};
    if (tab === "base") {
      const m = parseMacro(baseCal, basePro, baseCarb, baseFat);
      if (!m) return;
      update.daily = m;
    } else if (tab === "training") {
      const m = parseMacro(trainCal, trainPro, trainCarb, trainFat);
      if (!m) return;
      update.training = m;
    } else {
      const m = parseMacro(restCal, restPro, restCarb, restFat);
      if (!m) return;
      update.rest = m;
    }
    onApplyAdjustments(update);
    setSavedTab(tab);
    setTimeout(() => setSavedTab(null), 2000);
  };

  const resetToFormula = (tab: "training" | "rest") => {
    const b = parseMacro(baseCal, basePro, baseCarb, baseFat) ?? base;
    if (tab === "training") {
      setTrainCal(String(b.calories + CAL_SWING));
      setTrainPro(String(b.protein));
      setTrainCarb(String(b.carbs + CARB_SWING));
      setTrainFat(String(b.fat));
    } else {
      setRestCal(String(b.calories - CAL_SWING));
      setRestPro(String(b.protein));
      setRestCarb(String(Math.max(0, b.carbs - CARB_SWING)));
      setRestFat(String(b.fat));
    }
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

  const tabs: { id: TargetMode; label: string }[] = [
    { id: "base", label: "Base (average)" },
    { id: "training", label: "Training day" },
    { id: "rest", label: "Rest day" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="section-title !text-xl">Adjust your plan</h2>
        <p className="section-subtitle">Edit your targets or get AI suggestions based on your progress.</p>
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mt-0.5">Powered by Nova Lite</p>
      </div>

      {/* Macro targets with training/rest split */}
      <div className="card p-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Macro targets</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Set separate targets for training days and rest days, or a single base average.
        </p>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 rounded-lg bg-[var(--surface-2)] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "base" && (
          <>
            <p className="text-xs text-[var(--muted)] mb-3">
              Weekly average — used as a fallback on days with no workout data and as the basis for the formula split.
            </p>
            {macroInputs(
              { cal: baseCal, pro: basePro, carb: baseCarb, fat: baseFat },
              { setCal: setBaseCal, setPro: setBasePro, setCarb: setBaseCarb, setFat: setBaseFat },
            )}
          </>
        )}

        {activeTab === "training" && (
          <>
            <p className="text-xs text-[var(--muted)] mb-3">
              Used on workout days. Formula default: base +{CAL_SWING} kcal / +{CARB_SWING}g carbs.
            </p>
            {macroInputs(
              { cal: trainCal, pro: trainPro, carb: trainCarb, fat: trainFat },
              { setCal: setTrainCal, setPro: setTrainPro, setCarb: setTrainCarb, setFat: setTrainFat },
            )}
            <button type="button" onClick={() => resetToFormula("training")} className="mt-3 text-xs text-[var(--accent)] hover:underline">
              Reset to formula
            </button>
          </>
        )}

        {activeTab === "rest" && (
          <>
            <p className="text-xs text-[var(--muted)] mb-3">
              Used on rest/recovery days. Formula default: base −{CAL_SWING} kcal / −{CARB_SWING}g carbs.
            </p>
            {macroInputs(
              { cal: restCal, pro: restPro, carb: restCarb, fat: restFat },
              { setCal: setRestCal, setPro: setRestPro, setCarb: setRestCarb, setFat: setRestFat },
            )}
            <button type="button" onClick={() => resetToFormula("rest")} className="mt-3 text-xs text-[var(--accent)] hover:underline">
              Reset to formula
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => handleSave(activeTab)}
          disabled={!plan}
          className="mt-4 btn-primary"
        >
          {savedTab === activeTab ? "Saved" : "Save targets"}
        </button>
      </div>

      <div className="card p-6">
        <label className="label">Feedback (how are you feeling? any changes?)</label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={
            unitSystem === "metric"
              ? "e.g. Feeling tired, want to increase protein, lost 2 kg..."
              : "e.g. Feeling tired, want to increase protein, lost 4 lbs..."
          }
          rows={3}
          className="w-full input-base"
        />
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleGetLatestGuidance} disabled={researchLoading} className="btn-secondary !text-xs" title="Add current nutrition guidelines to your feedback">
              {researchLoading ? "Pulling guidance..." : "Add latest guidelines to my feedback"}
            </button>
            {researchSummary && (
              <p className="text-caption flex-1">Added: {researchSummary.slice(0, 90)}...</p>
            )}
          </div>
          <p className="text-[10px] text-[var(--muted)]">Powered by Nova — web search when available</p>
        </div>

        <div className="mt-5">
          <button onClick={onAdjust} disabled={loading || !plan} className="btn-primary">
            {loading ? "Analyzing..." : "Get AI suggestions"}
          </button>
        </div>
      </div>

      {result && suggestion && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <h3 className="section-title !text-base text-[var(--accent)]">Nova&apos;s suggestions</h3>
          {suggestion.explanation && (
            <p className="text-sm leading-relaxed">{suggestion.explanation}</p>
          )}
          {suggestion.changes && suggestion.changes.length > 0 && (
            <ul className="text-sm space-y-1 list-disc list-inside text-[var(--muted)]">
              {suggestion.changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          )}
          {suggestion.newTargets && (
            <button
              onClick={() => {
                const t = suggestion.newTargets as Macros;
                if (t && typeof t.calories === "number") {
                  onApplyAdjustments({
                    daily: t,
                    training: { ...t, calories: t.calories + CAL_SWING, carbs: t.carbs + CARB_SWING },
                    rest: { ...t, calories: t.calories - CAL_SWING, carbs: Math.max(0, t.carbs - CARB_SWING) },
                  });
                }
              }}
              className="btn-secondary"
            >
              Apply new calorie/macro targets
            </button>
          )}
        </div>
      )}
    </div>
  );
}
