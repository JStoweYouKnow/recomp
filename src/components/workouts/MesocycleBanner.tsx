"use client";

import { phaseLabel, type DeloadRecommendation, type MesocycleState } from "@/lib/mesocycle";

const PHASE_TONE: Record<MesocycleState["phase"], string> = {
  accumulation: "bg-[var(--accent)]/10 text-[var(--accent)]",
  peak: "bg-[var(--accent-sage)]/15 text-[var(--accent)]",
  deload: "bg-[var(--accent-warm)]/15 text-[var(--accent-warm)]",
};

/**
 * Where the lifter is in the current training block.
 *
 * Without this, a multi-week program is an undifferentiated wall of sessions. Naming the
 * phase is what makes a lighter week read as strategy rather than as falling behind.
 */
export function MesocycleBanner({
  state,
  deload,
  deloadForced,
}: {
  state: MesocycleState;
  deload: DeloadRecommendation;
  deloadForced: boolean;
}) {
  const showWarning = deload.urgency === "soon" && !deloadForced;

  return (
    <section className="card-base p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${PHASE_TONE[state.phase]}`}>
          {phaseLabel(state.phase)}
        </span>
        <span className="text-sm font-medium text-[var(--foreground)]">
          Week {state.weekInBlock} of {state.blockLength}
        </span>
        <span className="text-xs text-[var(--muted)]">Block {state.blockNumber}</span>
        {deloadForced && (
          <span className="rounded bg-[var(--accent-warm)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-warm)]">
            Pulled forward
          </span>
        )}
      </div>

      <p className="mt-2 text-sm leading-snug text-[var(--muted)]">{state.summary}</p>

      {/* Week dots make the block's shape legible at a glance. */}
      <div className="mt-3 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: state.blockLength }, (_, i) => {
          const week = i + 1;
          const isCurrent = week === state.weekInBlock;
          const isPast = week < state.weekInBlock;
          const isDeloadWeek = week === state.blockLength;
          return (
            <div
              key={week}
              className={`h-1.5 flex-1 rounded-full ${
                isCurrent
                  ? "bg-[var(--accent)]"
                  : isPast
                    ? "bg-[var(--accent)]/40"
                    : isDeloadWeek
                      ? "bg-[var(--accent-warm)]/30"
                      : "bg-[var(--surface-elevated)]"
              }`}
            />
          );
        })}
      </div>

      {(deloadForced || showWarning) && deload.reasons.length > 0 && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <p className="text-xs font-semibold text-[var(--foreground)]">
            {deloadForced ? "Why this week is a deload" : "A deload is coming"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {deload.reasons.map((reason) => (
              <li key={reason} className="text-xs text-[var(--muted)]">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
