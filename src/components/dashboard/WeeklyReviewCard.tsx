"use client";

import { useState } from "react";
import type { WeeklyReview } from "@/lib/types";

export function WeeklyReviewCard({
  weeklyReview,
  reviewLoading,
  onGenerate,
}: {
  weeklyReview: WeeklyReview | null;
  reviewLoading: boolean;
  onGenerate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="section-title !text-base">Weekly AI Review</h3>
          <p className="section-subtitle">Autonomous agent analyzes meals, wearables &amp; research</p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mt-0.5">Powered by Amazon Nova multi-agent</p>
        </div>
        <button onClick={onGenerate} disabled={reviewLoading} className="btn-primary flex-shrink-0">
          {reviewLoading ? "Analyzing..." : "Generate"}
        </button>
      </div>
      {reviewLoading && (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]" role="status" aria-live="polite">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          Agent running: analyzing meals, checking wearables, researching guidelines...
        </div>
      )}
      {weeklyReview && !reviewLoading && (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">{weeklyReview.summary}</p>
          {weeklyReview.agentSteps && weeklyReview.agentSteps.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="list" aria-label="Agent steps used">
              {weeklyReview.agentSteps.map((step, i) => (
                <span key={i} className="badge badge-accent" role="listitem">{step.tool}</span>
              ))}
            </div>
          )}
          <button onClick={() => setExpanded(!expanded)} className="btn-ghost !px-0 text-xs text-[var(--accent)]">
            {expanded ? "Show less" : "Show full review"}
          </button>
          {expanded && (
            <div className="space-y-4 border-t border-[var(--border-soft)] pt-4 animate-fade-in">
              {weeklyReview.mealAnalysis && (
                <div>
                  <p className="stat-label mb-1">Meal Analysis</p>
                  <p className="text-sm leading-relaxed">{weeklyReview.mealAnalysis}</p>
                </div>
              )}
              {weeklyReview.wearableInsights && (
                <div>
                  <p className="stat-label mb-1">Wearable Insights</p>
                  <p className="text-sm leading-relaxed">{weeklyReview.wearableInsights}</p>
                </div>
              )}
              {weeklyReview.recommendations && weeklyReview.recommendations.length > 0 && (
                <div>
                  <p className="stat-label mb-1">Recommendations</p>
                  <ul className="list-disc pl-4 text-sm space-y-1 leading-relaxed">
                    {weeklyReview.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-caption text-[var(--muted)]">
                Generated {new Date(weeklyReview.createdAt).toLocaleDateString()} via {weeklyReview.agentSteps?.length ?? 0} Nova agent steps
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
