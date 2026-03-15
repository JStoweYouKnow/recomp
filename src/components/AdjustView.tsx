"use client";

import { useState, useEffect } from "react";
import type { UserProfile, FitnessPlan, Macros } from "@/lib/types";

const DEFAULT_TARGETS: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

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
  onApplyAdjustments: (t: Macros) => void;
}) {
  const diet = result?.dietAdjustments as { newTargets?: Macros; summary?: string } | undefined;
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchSummary, setResearchSummary] = useState<string | null>(null);

  const currentTargets = plan?.dietPlan?.dailyTargets ?? DEFAULT_TARGETS;
  const [manualCal, setManualCal] = useState(String(currentTargets.calories));
  const [manualPro, setManualPro] = useState(String(currentTargets.protein));
  const [manualCarb, setManualCarb] = useState(String(currentTargets.carbs));
  const [manualFat, setManualFat] = useState(String(currentTargets.fat));
  const [manualSaved, setManualSaved] = useState(false);

  useEffect(() => {
    setManualCal(String(currentTargets.calories));
    setManualPro(String(currentTargets.protein));
    setManualCarb(String(currentTargets.carbs));
    setManualFat(String(currentTargets.fat));
  }, [currentTargets.calories, currentTargets.protein, currentTargets.carbs, currentTargets.fat]);

  const handleSaveManualTargets = () => {
    const c = Math.round(parseFloat(manualCal) || 0);
    const p = Math.round(parseFloat(manualPro) || 0);
    const cb = Math.round(parseFloat(manualCarb) || 0);
    const f = Math.round(parseFloat(manualFat) || 0);
    if (c < 800 || c > 5000) return;
    onApplyAdjustments({
      calories: Math.max(800, Math.min(5000, c)),
      protein: Math.max(20, Math.min(400, p)),
      carbs: Math.max(0, Math.min(600, cb)),
      fat: Math.max(0, Math.min(200, f)),
    });
    setManualSaved(true);
    setTimeout(() => setManualSaved(false), 2000);
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

      {/* Manual calorie & macro targets */}
      <div className="card p-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Daily targets</h3>
        <p className="text-sm text-[var(--muted)] mb-4">Set your calorie and macro goals directly. Changes apply immediately.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label !mb-1">Calories</label>
            <input
              type="number"
              min={800}
              max={5000}
              value={manualCal}
              onChange={(e) => setManualCal(e.target.value)}
              className="input-base w-full"
              placeholder="2000"
            />
          </div>
          <div>
            <label className="label !mb-1">Protein (g)</label>
            <input
              type="number"
              min={20}
              max={400}
              value={manualPro}
              onChange={(e) => setManualPro(e.target.value)}
              className="input-base w-full"
              placeholder="150"
            />
          </div>
          <div>
            <label className="label !mb-1">Carbs (g)</label>
            <input
              type="number"
              min={0}
              max={600}
              value={manualCarb}
              onChange={(e) => setManualCarb(e.target.value)}
              className="input-base w-full"
              placeholder="200"
            />
          </div>
          <div>
            <label className="label !mb-1">Fat (g)</label>
            <input
              type="number"
              min={0}
              max={200}
              value={manualFat}
              onChange={(e) => setManualFat(e.target.value)}
              className="input-base w-full"
              placeholder="65"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveManualTargets}
          disabled={!plan}
          className="mt-4 btn-primary"
        >
          {manualSaved ? "Saved" : "Save targets"}
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

      {result && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <h3 className="section-title !text-base text-[var(--accent)]">Nova&apos;s suggestions</h3>
          {(result.dietAdjustments as { summary?: string })?.summary && (
            <p className="text-sm leading-relaxed">{(result.dietAdjustments as { summary: string }).summary}</p>
          )}
          {(result.workoutAdjustments as { summary?: string })?.summary && (
            <p className="text-sm leading-relaxed">{(result.workoutAdjustments as { summary: string }).summary}</p>
          )}
          {diet?.newTargets && (
            <button
              onClick={() => {
                const t = diet.newTargets as Macros;
                if (t && typeof t.calories === "number") onApplyAdjustments(t);
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
