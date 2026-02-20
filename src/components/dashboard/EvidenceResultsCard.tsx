"use client";

import { useState } from "react";

/** Sample outcomes from the Jordan demo user — demonstrates app impact for judges. */
const SAMPLE_METRICS = [
  { label: "Macro adherence (7-day avg)", value: "87%", desc: "Calories, protein, carbs, fat vs targets" },
  { label: "Weekly AI score", value: "7/10", desc: "Multi-agent review synthesis" },
  { label: "Meals logged", value: "21", desc: "Across 7 days, mixed text/voice" },
  { label: "Streak", value: "7 days", desc: "Consistent tracking" },
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
          {SAMPLE_METRICS.map((m) => (
            <div key={m.label} className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{m.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[var(--foreground)]">{m.value}</p>
              <p className="mt-0.5 text-[10px] text-[var(--muted)]">{m.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
