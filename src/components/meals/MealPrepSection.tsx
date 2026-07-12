"use client";

import { useState } from "react";
import type { MealPrepPlan } from "@/lib/types";
import { getMealPrepPlan, saveMealPrepPlan, getPantry } from "@/lib/storage";
import { syncToServer } from "@/lib/storage";
import { getTodayLocal } from "@/lib/date-utils";
import { getWeekStart } from "@/lib/date-utils";

export function MealPrepSection({
  targets,
  onAddMeals,
}: {
  targets: { calories: number; protein: number; carbs: number; fat: number };
  onAddMeals?: (meals: { name: string; macros: { calories: number; protein: number; carbs: number; fat: number }; mealType: string }[]) => void;
}) {
  const [plan, setPlan] = useState<MealPrepPlan | null>(() => getMealPrepPlan());
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [groceryLoading, setGroceryLoading] = useState(false);
  const [newItem, setNewItem] = useState("");

  const weekStart = getWeekStart(getTodayLocal());
  const groceryList = plan?.groceryList ?? [];

  const persistPlan = (next: MealPrepPlan) => {
    setPlan(next);
    saveMealPrepPlan(next);
    syncToServer();
  };

  const fetchGroceryList = async (forPlan: MealPrepPlan): Promise<MealPrepPlan["groceryList"]> => {
    const res = await fetch("/api/meal-prep/grocery-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipes: forPlan.recipes,
        pantryItems: getPantry().map((p) => ({ name: p.name })),
      }),
    });
    const data = await res.json();
    return Array.isArray(data.groceryList) ? data.groceryList : [];
  };

  const generate = async () => {
    setLoading(true);
    try {
      const pantry = getPantry();
      const res = await fetch("/api/meal-prep/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyTargets: targets,
          pantryItems: pantry.map((p) => p.name),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const p: MealPrepPlan = {
        id: `prep-${Date.now()}`,
        weekStart,
        recipes: data.recipes ?? [],
        groceryList: [],
        batchInstructions: data.batchInstructions ?? [],
        estimatedPrepTime: data.estimatedPrepTime ?? 120,
        createdAt: new Date().toISOString(),
      };
      p.groceryList = await fetchGroceryList(p).catch(() => []);
      persistPlan(p);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const rebuildGrocery = async () => {
    if (!plan?.recipes?.length) return;
    setGroceryLoading(true);
    try {
      const rebuilt = await fetchGroceryList(plan);
      // Keep custom items and checked state for items that survive the rebuild.
      const prior = new Map(plan.groceryList.map((g) => [g.item, g]));
      const custom = plan.groceryList.filter((g) => g.category === "custom");
      const merged = rebuilt.map((g) => ({ ...g, checked: prior.get(g.item)?.checked ?? false }));
      persistPlan({ ...plan, groceryList: [...merged, ...custom] });
    } catch {
      // keep existing list
    } finally {
      setGroceryLoading(false);
    }
  };

  const toggleItem = (item: string) => {
    if (!plan) return;
    persistPlan({
      ...plan,
      groceryList: plan.groceryList.map((g) => (g.item === item ? { ...g, checked: !g.checked } : g)),
    });
  };

  const addItem = () => {
    if (!plan) return;
    const trimmed = newItem.trim().toLowerCase();
    if (!trimmed || plan.groceryList.some((g) => g.item === trimmed)) return;
    setNewItem("");
    persistPlan({
      ...plan,
      groceryList: [...plan.groceryList, { item: trimmed, amount: "", category: "custom", checked: false }],
    });
  };

  const removeItem = (item: string) => {
    if (!plan) return;
    persistPlan({ ...plan, groceryList: plan.groceryList.filter((g) => g.item !== item) });
  };

  return (
    <div className="card rounded-xl p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <h4 className="font-semibold text-sm">Meal prep</h4>
        <span className="text-xs text-[var(--muted)]">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 animate-fade-in">
          <p className="text-xs text-[var(--muted)]">Generate a batch-cookable weekly plan and grocery list.</p>
          <button type="button" onClick={generate} disabled={loading} className="btn-primary text-sm py-2 w-full disabled:opacity-50">
            {loading ? "Generating…" : "Generate meal prep plan"}
          </button>
          {plan && plan.recipes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--muted)]">Recipes</p>
              {plan.recipes.slice(0, 4).map((r, i) => (
                <div key={i} className="rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-xs flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{r.name}</span>
                    <span className="text-[var(--muted)] ml-2">
                      {r.macrosPerServing.calories} cal · {r.servings} servings
                    </span>
                  </div>
                  {onAddMeals && (
                    <button
                      type="button"
                      onClick={() => onAddMeals([{ name: r.name, macros: r.macrosPerServing, mealType: "lunch" }])}
                      className="shrink-0 rounded px-2 py-0.5 text-label font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
                    >
                      Add
                    </button>
                  )}
                </div>
              ))}
              {plan.recipes.length > 4 && <p className="text-label text-[var(--muted)]">+{plan.recipes.length - 4} more</p>}

              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[var(--muted)]">
                  Grocery list{groceryList.length > 0 && ` (${groceryList.filter((g) => !g.checked).length} to buy)`}
                </p>
                <button type="button" onClick={rebuildGrocery} disabled={groceryLoading} className="text-label text-[var(--accent)] hover:underline disabled:opacity-50">
                  {groceryLoading ? "Loading…" : groceryList.length > 0 ? "Rebuild" : "Get grocery list"}
                </button>
              </div>
              {groceryList.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {groceryList.map((g) => (
                    <div key={g.item} className="flex items-center gap-2 text-xs group">
                      <input
                        type="checkbox"
                        checked={g.checked}
                        onChange={() => toggleItem(g.item)}
                        className="accent-[var(--accent)] shrink-0"
                        aria-label={`Mark ${g.item} as bought`}
                      />
                      <span className={`flex-1 truncate ${g.checked ? "line-through text-[var(--muted)]" : ""}`}>{g.item}</span>
                      <span className="text-[var(--muted)] shrink-0">{g.amount}</span>
                      <button
                        type="button"
                        onClick={() => removeItem(g.item)}
                        className="shrink-0 text-[var(--muted)] hover:text-[var(--accent-terracotta)]"
                        aria-label={`Remove ${g.item}`}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
                  placeholder="Add an item…"
                  className="input-base rounded-lg px-3 py-1.5 text-xs flex-1"
                />
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!newItem.trim()}
                  className="rounded-lg border border-[var(--accent)] px-3 py-1.5 text-xs text-[var(--accent)] disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
