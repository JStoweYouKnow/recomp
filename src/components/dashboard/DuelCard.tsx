"use client";

import { useState } from "react";
import { getChallenges } from "@/lib/storage";
import type { Challenge } from "@/lib/types";

export function DuelCard() {
  const [duels] = useState<Challenge[]>(() =>
    getChallenges().filter((c) => c.type === "duel" && c.status === "active")
  );

  if (duels.length === 0) return null;

  return (
    <div className="space-y-3">
      {duels.map((duel) => {
        const me = duel.participants[0];
        const opponent = duel.participants[1];
        if (!me || !opponent) return null;

        const myPct = duel.target > 0 ? Math.min(100, (me.progress / duel.target) * 100) : 0;
        const oppPct = duel.target > 0 ? Math.min(100, (opponent.progress / duel.target) * 100) : 0;
        const winning = me.progress > opponent.progress;
        const tied = me.progress === opponent.progress;

        const endDate = new Date(duel.endDate);
        const now = new Date();
        const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000));

        return (
          <div key={duel.id} className="card p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-h6 font-semibold">{duel.title}</h3>
              <span className="badge badge-muted text-[10px]">
                {daysLeft}d left
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* My side */}
              <div className="flex-1 text-center">
                <div className="text-2xl mb-1" aria-hidden>
                  {"\ud83d\udcaa"}
                </div>
                <p className="text-sm font-medium truncate">{me.name || "You"}</p>
                <p className="text-lg font-bold tabular-nums text-[var(--accent)]">
                  {me.progress}
                </p>
                <div className="progress-track !h-[5px] mt-1">
                  <div
                    className="progress-fill"
                    style={{ width: `${myPct}%`, background: "var(--accent)" }}
                  />
                </div>
              </div>

              {/* VS */}
              <div className="duel-vs">VS</div>

              {/* Opponent side */}
              <div className="flex-1 text-center">
                <div className="text-2xl mb-1" aria-hidden>
                  {"\ud83c\udfaf"}
                </div>
                <p className="text-sm font-medium truncate">{opponent.name}</p>
                <p className="text-lg font-bold tabular-nums text-[var(--accent-warm)]">
                  {opponent.progress}
                </p>
                <div className="progress-track !h-[5px] mt-1">
                  <div
                    className="progress-fill"
                    style={{ width: `${oppPct}%`, background: "var(--accent-warm)" }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 text-center">
              <span
                className={`text-xs font-semibold ${
                  tied
                    ? "text-[var(--muted)]"
                    : winning
                      ? "text-[var(--accent)]"
                      : "text-[var(--accent-terracotta)]"
                }`}
              >
                {tied ? "Neck and neck!" : winning ? "You're in the lead!" : "Falling behind\u2014push harder!"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
