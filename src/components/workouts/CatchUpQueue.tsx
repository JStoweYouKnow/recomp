"use client";

import { useMemo, useState } from "react";
import type { FitnessPlan } from "@/lib/types";
import { getCatchUpQueue, removeCatchUpItem } from "@/lib/workout-schedule";
import { getTodayLocal, getUpcomingDates } from "@/lib/date-utils";

interface CatchUpQueueProps {
  plan: FitnessPlan;
  progress: Record<string, string>;
  onUpdatePlan: (plan: FitnessPlan) => void;
  onSync?: () => void;
  onSelectDate?: (date: string) => void;
  showToast?: (msg: string) => void;
}

export function CatchUpQueue({ plan, progress, onUpdatePlan, onSync, onSelectDate, showToast }: CatchUpQueueProps) {
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const queue = useMemo(() => getCatchUpQueue(plan), [plan]);
  const upcoming = useMemo(() => getUpcomingDates(7, getTodayLocal()), []);

  if (queue.length === 0) return null;

  const reschedule = async (sessionId: string, planIndex: number, scheduledDate: string, rescheduledTo: string) => {
    setReschedulingId(sessionId);
    try {
      const res = await fetch("/api/plans/adjust-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          action: "reschedule",
          workoutProgress: progress,
          planIndex,
          scheduledDate,
          rescheduledTo,
        }),
      });
      if (!res.ok) throw new Error("Reschedule failed");
      const data = (await res.json()) as { workoutPlan: FitnessPlan["workoutPlan"]; summary: string };
      onUpdatePlan({ ...plan, workoutPlan: data.workoutPlan });
      showToast?.(data.summary);
      onSync?.();
    } catch {
      showToast?.("Could not reschedule. Try again.");
    } finally {
      setReschedulingId(null);
    }
  };

  const remove = (sessionId: string) => {
    onUpdatePlan(removeCatchUpItem(plan, sessionId));
    onSync?.();
  };

  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4" role="region" aria-label="Catch-up queue">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Catch-up queue ({queue.length})</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">Missed sessions you can still complete or reschedule.</p>
      <ul className="mt-3 space-y-2">
        {queue.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium">{item.dayLabel ?? "Workout"}</span>
              {item.focus ? <span className="text-[var(--muted)]"> · {item.focus}</span> : null}
              <div className="text-xs text-[var(--muted)]">
                Scheduled {item.scheduledDate}
                {item.rescheduledTo ? ` → ${item.rescheduledTo}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => onSelectDate?.(item.rescheduledTo ?? item.scheduledDate)}
              >
                Open
              </button>
              <select
                className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
                defaultValue=""
                disabled={reschedulingId === item.id}
                aria-label={`Reschedule ${item.dayLabel}`}
                onChange={(e) => {
                  const to = e.target.value;
                  if (!to) return;
                  void reschedule(item.id, item.planIndex, item.scheduledDate, to);
                  e.target.value = "";
                }}
              >
                <option value="">Move to…</option>
                {upcoming.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button type="button" className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]" onClick={() => remove(item.id)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
