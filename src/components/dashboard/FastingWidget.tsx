"use client";

import { useState, useEffect } from "react";
import type { FastingSession } from "@/lib/types";
import { getFastingSessions, saveFastingSessions } from "@/lib/storage";
import { syncToServer } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";

const PROTOCOLS: { protocol: FastingSession["protocol"]; hours: number }[] = [
  { protocol: "16:8", hours: 16 },
  { protocol: "18:6", hours: 18 },
  { protocol: "20:4", hours: 20 },
  { protocol: "OMAD", hours: 23 },
];

function formatElapsed(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function FastingWidget() {
  const [sessions, setSessions] = useState<FastingSession[]>(() => getFastingSessions());
  const active = sessions.find((s) => !s.endTime) ?? null;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active?.startTime) return;
    const start = new Date(active.startTime).getTime();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [active?.startTime]);

  const startFast = (targetHours: number, protocol: FastingSession["protocol"]) => {
    const session: FastingSession = {
      id: uuidv4(),
      startTime: new Date().toISOString(),
      targetHours,
      protocol,
    };
    const next = [...sessions, session];
    setSessions(next);
    saveFastingSessions(next);
    syncToServer();
  };

  const endFast = () => {
    if (!active) return;
    const next = sessions.map((s) =>
      s.id === active.id ? { ...s, endTime: new Date().toISOString() } : s
    );
    setSessions(next);
    saveFastingSessions(next);
    syncToServer();
  };

  if (active) {
    const targetMs = active.targetHours * 3600000;
    const progress = Math.min(100, (elapsed / targetMs) * 100);
    return (
      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Fasting</h4>
          <span className="text-[10px] text-[var(--muted)]">{active.protocol}</span>
        </div>
        <p className="text-2xl font-bold tabular-nums text-[var(--accent)]">{formatElapsed(elapsed)}</p>
        <div className="progress-track !mt-0">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] text-[var(--muted)]">Target: {active.targetHours}h</p>
        <button type="button" onClick={endFast} className="btn-secondary text-xs w-full py-2">
          End fast
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
      <h4 className="text-sm font-semibold">Fasting Timer</h4>
      <p className="text-xs text-[var(--muted)]">Start a fast to track</p>
      <div className="grid grid-cols-2 gap-1.5">
        {PROTOCOLS.map(({ protocol, hours }) => (
          <button
            key={protocol}
            type="button"
            onClick={() => startFast(hours, protocol)}
            className="btn-secondary text-xs py-2"
          >
            {protocol}
          </button>
        ))}
      </div>
    </div>
  );
}
