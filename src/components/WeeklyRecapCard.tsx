"use client";

import { useState, useRef, useCallback } from "react";
import type { MealEntry, Milestone, Macros } from "@/lib/types";
import { getBadgeInfo } from "@/lib/milestones";

interface WeeklyRecapCardProps {
  meals: MealEntry[];
  milestones: Milestone[];
  xp: number;
  streak: number;
  targets: Macros;
}

export function WeeklyRecapCard({ meals, milestones, xp, streak, targets }: WeeklyRecapCardProps) {
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Compute last 7 days stats
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  const weekMeals = meals.filter((m) => m.date >= weekAgoStr);
  const totalCals = weekMeals.reduce((s, m) => s + m.macros.calories, 0);
  const avgProtein = weekMeals.length
    ? Math.round(weekMeals.reduce((s, m) => s + m.macros.protein, 0) / Math.max(1, new Set(weekMeals.map((m) => m.date)).size))
    : 0;

  const daysLogged = new Set(weekMeals.map((m) => m.date)).size;

  // Macro accuracy
  const dailyTotals = new Map<string, Macros>();
  weekMeals.forEach((m) => {
    const prev = dailyTotals.get(m.date) || { calories: 0, protein: 0, carbs: 0, fat: 0 };
    dailyTotals.set(m.date, {
      calories: prev.calories + m.macros.calories,
      protein: prev.protein + m.macros.protein,
      carbs: prev.carbs + m.macros.carbs,
      fat: prev.fat + m.macros.fat,
    });
  });
  let daysHit = 0;
  dailyTotals.forEach((totals) => {
    const calOk = Math.abs(totals.calories - targets.calories) <= targets.calories * 0.15;
    const proOk = totals.protein >= targets.protein * 0.9;
    if (calOk && proOk) daysHit++;
  });
  const macroAccuracy = daysLogged > 0 ? Math.round((daysHit / daysLogged) * 100) : 0;

  // Badges earned this week
  const badgeInfo = getBadgeInfo();
  const weekBadges = milestones.filter((m) => m.earnedAt >= weekAgoStr);

  // Top meal
  const topMeal = weekMeals.length
    ? weekMeals.reduce((best, m) => (m.macros.protein > best.macros.protein ? m : best), weekMeals[0])
    : null;

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      // Create a canvas-based share image
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 600, 400);
      grad.addColorStop(0, "#6b7c3c");
      grad.addColorStop(1, "#4a5a28");
      ctx.fillStyle = grad;
      ctx.roundRect(0, 0, 600, 400, 24);
      ctx.fill();

      // Title
      ctx.fillStyle = "#faf8f5";
      ctx.font = "bold 28px system-ui";
      ctx.fillText("My Weekly Recap", 40, 55);

      ctx.font = "14px system-ui";
      ctx.fillStyle = "rgba(250,248,245,0.7)";
      ctx.fillText("Recomp \u2022 Body Recomposition", 40, 80);

      // Stats grid
      const stats = [
        { label: "Meals Logged", value: String(weekMeals.length) },
        { label: "Days Active", value: `${daysLogged}/7` },
        { label: "Avg Protein", value: `${avgProtein}g` },
        { label: "Macro Accuracy", value: `${macroAccuracy}%` },
        { label: "Streak", value: `${streak} days` },
        { label: "XP Total", value: String(xp) },
      ];

      stats.forEach((stat, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 40 + col * 180;
        const y = 120 + row * 100;

        ctx.fillStyle = "rgba(250,248,245,0.1)";
        ctx.roundRect(x, y, 160, 80, 12);
        ctx.fill();

        ctx.fillStyle = "#faf8f5";
        ctx.font = "bold 24px system-ui";
        ctx.fillText(stat.value, x + 16, y + 35);

        ctx.fillStyle = "rgba(250,248,245,0.6)";
        ctx.font = "12px system-ui";
        ctx.fillText(stat.label, x + 16, y + 58);
      });

      // Badges
      if (weekBadges.length > 0) {
        ctx.fillStyle = "rgba(250,248,245,0.7)";
        ctx.font = "12px system-ui";
        ctx.fillText(`${weekBadges.length} badge${weekBadges.length > 1 ? "s" : ""} earned this week`, 40, 360);
      }

      // Footer
      ctx.fillStyle = "rgba(250,248,245,0.4)";
      ctx.font = "11px system-ui";
      ctx.fillText("recomp.fit", 40, 385);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) return;

      if (navigator.share) {
        const file = new File([blob], "recomp-weekly-recap.png", { type: "image/png" });
        await navigator.share({
          title: "My Recomp Weekly Recap",
          files: [file],
        }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "recomp-weekly-recap.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setSharing(false);
    }
  }, [weekMeals, daysLogged, avgProtein, macroAccuracy, streak, xp, weekBadges]);

  return (
    <div ref={cardRef} className="card p-5 animate-fade-in section-organic">
      <div className="relative z-[1]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>{"\ud83d\udcca"}</span>
            <h3 className="text-h6 font-semibold">Weekly Recap</h3>
          </div>
          <button
            onClick={handleShare}
            disabled={sharing}
            className="btn-secondary !py-1.5 !px-3 text-xs"
          >
            {sharing ? "Generating..." : "\ud83d\udce4 Share"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="card-flat rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-[var(--foreground)] tabular-nums">{weekMeals.length}</p>
            <p className="text-label text-[var(--muted)] uppercase tracking-wider">Meals</p>
          </div>
          <div className="card-flat rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-[var(--foreground)] tabular-nums">{daysLogged}/7</p>
            <p className="text-label text-[var(--muted)] uppercase tracking-wider">Days Active</p>
          </div>
          <div className="card-flat rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-[var(--accent)] tabular-nums">{macroAccuracy}%</p>
            <p className="text-label text-[var(--muted)] uppercase tracking-wider">Macro Acc.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="card-flat rounded-xl p-3">
            <p className="text-sm text-[var(--muted)]">Avg Daily Protein</p>
            <p className="text-lg font-bold text-[var(--accent-sage)]">{avgProtein}g</p>
          </div>
          <div className="card-flat rounded-xl p-3">
            <p className="text-sm text-[var(--muted)]">Total Calories</p>
            <p className="text-lg font-bold text-[var(--accent-warm)]">{totalCals.toLocaleString()}</p>
          </div>
        </div>

        {weekBadges.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-[var(--muted)] mb-1.5">Badges Earned</p>
            <div className="flex flex-wrap gap-1.5">
              {weekBadges.map((b) => (
                <span key={b.id} className="badge badge-accent text-label">
                  {badgeInfo[b.id]?.name || b.id}
                </span>
              ))}
            </div>
          </div>
        )}

        {topMeal && (
          <div className="card-flat rounded-xl p-3">
            <p className="text-xs text-[var(--muted)] mb-1">Top Protein Meal</p>
            <p className="text-sm font-medium">{topMeal.name}</p>
            <p className="text-xs text-[var(--accent-sage)]">{topMeal.macros.protein}g protein</p>
          </div>
        )}
      </div>
    </div>
  );
}
