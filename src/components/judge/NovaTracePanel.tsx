"use client";

import { useCallback, useEffect, useState } from "react";

type TraceStatus = "ok" | "error" | "fallback";

interface TraceEntry {
  id: string;
  at: string;
  action: string;
  service: string;
  model?: string;
  status: TraceStatus;
  durationMs?: number;
  detail?: string;
}

export function NovaTracePanel() {
  const [judgeMode, setJudgeMode] = useState(false);
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/judge/nova-trace?limit=30", { cache: "no-store" });
      const data = (await res.json()) as { judgeMode?: boolean; traces?: TraceEntry[] };
      setJudgeMode(Boolean(data.judgeMode));
      setTraces(Array.isArray(data.traces) ? data.traces : []);
    } catch {
      setJudgeMode(false);
      setTraces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const clearTrace = async () => {
    await fetch("/api/judge/nova-trace", { method: "DELETE" });
    void load();
  };

  if (!judgeMode) return null;

  return (
    <section className="card p-4 mb-4 border border-[var(--accent)]/30 bg-[var(--accent)]/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Judge mode</p>
          <h3 className="text-sm font-semibold">Nova Call Trace</h3>
          <p className="text-xs text-[var(--muted)]">Live trace of model/service calls for technical judging.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs px-2 py-1 rounded border border-[var(--border-soft)] hover:bg-[var(--surface-elevated)]"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void clearTrace()}
            className="text-xs px-2 py-1 rounded border border-[var(--border-soft)] hover:bg-[var(--surface-elevated)]"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-[var(--muted)]">Loading trace…</p>
        ) : traces.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No trace entries yet. Run any AI action (plan, The Ref, voice, meals, Act).</p>
        ) : (
          traces.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)]/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{entry.action}</p>
                <span className="text-label text-[var(--muted)]">{entry.durationMs ?? 0}ms</span>
              </div>
              <p className="text-label-lg text-[var(--muted)]">
                {entry.service}
                {entry.model ? ` · ${entry.model}` : ""}
                {" · "}
                <span className={entry.status === "error" ? "text-red-500" : entry.status === "fallback" ? "text-amber-600" : "text-emerald-600"}>
                  {entry.status}
                </span>
              </p>
              {entry.detail && <p className="text-label text-[var(--muted)] mt-1">{entry.detail}</p>}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
