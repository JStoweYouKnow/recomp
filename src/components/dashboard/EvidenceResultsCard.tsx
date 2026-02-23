"use client";

import { useState } from "react";

/** Sample outcomes from the Jordan demo user — demonstrates app impact for judges. */
const SAMPLE_METRICS = [
  { label: "Macro adherence (7-day avg)", value: "87%", desc: "Calories, protein, carbs, fat vs targets", icon: "target" },
  { label: "Weekly AI score", value: "7/10", desc: "Multi-agent review synthesis", icon: "gauge" },
  { label: "Meals logged", value: "21", desc: "Across 7 days, mixed text/voice", icon: "meal" },
  { label: "Streak", value: "7 days", desc: "Consistent tracking", icon: "flame" },
];

export function EvidenceResultsCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="section-title !text-base">Evidence &amp; Results</h3>
          <p className="section-subtitle">
            Sample outcomes from the pre-seeded demo user (Jordan). Use &quot;Try pre-seeded demo&quot; on the landing page to see this data.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="btn-ghost !px-0 text-xs text-[var(--accent)]"
        >
          {expanded ? "Show less" : "Show metrics"}
        </button>
      </div>
      {expanded && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
          {SAMPLE_METRICS.map((m, i) => (
            <div
              key={m.label}
              className="relative overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-4 py-3"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none" aria-hidden />
              <div className="relative flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                  {m.icon === "target" && (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  )}
                  {m.icon === "gauge" && (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /></svg>
                  )}
                  {m.icon === "meal" && (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  )}
                  {m.icon === "flame" && (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{m.label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[var(--foreground)]">{m.value}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">{m.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
