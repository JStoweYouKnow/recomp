"use client";

import { useState } from "react";
import type { UserProfile, FitnessPlan, Macros } from "@/lib/types";

export function AdjustView({
  plan,
  goal,
  feedback,
  setFeedback,
  result,
  loading,
  onAdjust,
  onApplyAdjustments,
}: {
  plan: FitnessPlan | null;
  goal: UserProfile["goal"];
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
        <p className="section-subtitle">Analyze your progress and get dynamic adjustment suggestions.</p>
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mt-0.5">Powered by Nova Lite</p>
      </div>

      <div className="card p-6">
        <label className="label">Feedback (how are you feeling? any changes?)</label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. Feeling tired, want to increase protein, lost 4 lbs..."
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
