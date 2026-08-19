"use client";

import type { SetPrescription } from "@/lib/progression";

const ACTION_STYLES: Record<
  SetPrescription["action"],
  { label: string; tone: string }
> = {
  add_load: { label: "Add load", tone: "text-[var(--accent)] bg-[var(--accent)]/10" },
  add_reps: { label: "Add reps", tone: "text-[var(--accent)] bg-[var(--accent)]/10" },
  hold: { label: "Hold", tone: "text-[var(--accent-warm)] bg-[var(--accent-warm)]/10" },
  deload: { label: "Deload", tone: "text-[var(--accent-warm)] bg-[var(--accent-warm)]/15" },
  establish_baseline: { label: "Baseline", tone: "text-[var(--muted)] bg-[var(--surface-elevated)]" },
};

function formatTarget(rx: SetPrescription): string | null {
  if (rx.targetWeightLbs == null) return null;
  const weight = Number.isInteger(rx.targetWeightLbs)
    ? `${rx.targetWeightLbs}`
    : rx.targetWeightLbs.toFixed(1);
  return `${weight} lb × ${rx.targetReps}`;
}

/**
 * The computed target for this exercise's next session — the concrete
 * "what to do today" line. Renders nothing when there is no history to
 * progress from, so untracked exercises stay visually quiet.
 */
export function ProgressionTarget({ prescription }: { prescription?: SetPrescription }) {
  if (!prescription) return null;
  if (prescription.action === "hold" && prescription.targetWeightLbs == null) return null;

  const target = formatTarget(prescription);
  const style = ACTION_STYLES[prescription.action];

  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.tone}`}>
          {style.label}
        </span>
        {target ? (
          <span className="text-sm font-semibold text-[var(--foreground)]">
            {target}
            <span className="ml-1 font-normal text-[var(--muted)]">
              × {prescription.targetSets} sets
            </span>
          </span>
        ) : (
          <span className="text-sm font-medium text-[var(--muted)]">Set your baseline</span>
        )}
        {prescription.targetRpe != null && target && (
          <span className="text-xs text-[var(--muted)]">@ RPE {prescription.targetRpe}</span>
        )}
      </div>
      <p className="mt-1 text-xs leading-snug text-[var(--muted)]">{prescription.rationale}</p>
      {prescription.previous?.weightLbs != null && (
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Last: {prescription.previous.weightLbs} lb × {prescription.previous.reps}
          {prescription.previous.rpe != null ? ` @ RPE ${prescription.previous.rpe}` : ""} on{" "}
          {prescription.previous.date}
        </p>
      )}
    </div>
  );
}
