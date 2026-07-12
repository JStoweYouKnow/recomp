"use client";

import { useState } from "react";
import { getSavedRecipes, saveSavedRecipes, syncToServer } from "@/lib/storage";
import type { Macros } from "@/lib/types";

interface ScoredSuggestion {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  recipeUrl?: string;
  source?: string;
  fitScore: number;
  fitReason: string;
}

export function AskRefRecipes({
  macroTargets,
  todayMacros,
  goal,
  mealType,
  onApply,
}: {
  macroTargets: Macros;
  todayMacros: Macros;
  goal?: string;
  mealType?: string;
  onApply?: (s: ScoredSuggestion) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ScoredSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlSaving, setUrlSaving] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recipes/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          macroTargets,
          todayMacros,
          goal,
          mealType,
          recipes: getSavedRecipes(),
          includeDiscover: true,
          limit: 6,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setSuggestions(data.suggestions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load suggestions");
      setSuggestions(null);
    } finally {
      setLoading(false);
    }
  };

  const saveFromUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/recipes/save-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.recipe) {
        const existing = getSavedRecipes();
        const next = [
          data.recipe,
          ...existing.filter((r) => r.id !== data.recipe.id && (r.recipeUrl ?? "") !== (data.recipe.recipeUrl ?? "")),
        ];
        saveSavedRecipes(next);
        syncToServer();
        setUrlInput("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save recipe");
    } finally {
      setUrlSaving(false);
    }
  };

  return (
    <div className="card rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Ask Ref what to cook</h3>
          <p className="text-xs text-[var(--muted)]">
            Ranks your saved recipes against today&apos;s remaining macros. Optionally discovers new ideas via Edamam.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchSuggestions}
          disabled={loading}
          className="btn-primary rounded-lg px-4 py-2 text-sm whitespace-nowrap disabled:opacity-50"
        >
          {loading ? "Ranking…" : "Get picks"}
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste recipe URL to save…"
          className="input-base rounded-lg px-3 py-2 text-sm flex-1"
        />
        <button
          type="button"
          onClick={saveFromUrl}
          disabled={urlSaving || !urlInput.trim()}
          className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm text-[var(--accent)] disabled:opacity-50"
        >
          {urlSaving ? "Saving…" : "Save URL"}
        </button>
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}

      {suggestions && suggestions.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          No strong matches yet — save recipes from the Import tab or paste a URL above.
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{s.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {s.calories} cal · {s.protein}g P · score {s.fitScore}
                </div>
                <div className="text-xs text-[var(--muted)]">{s.fitReason}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                {s.recipeUrl && (
                  <a
                    href={s.recipeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Open
                  </a>
                )}
                {onApply && (
                  <button
                    type="button"
                    onClick={() => onApply(s)}
                    className="text-xs font-medium text-[var(--accent)]"
                  >
                    Log meal
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
