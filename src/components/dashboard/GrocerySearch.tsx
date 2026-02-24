"use client";

import { useState } from "react";
import type { FitnessPlan } from "@/lib/types";

interface GroceryResult {
  searchTerm: string;
  found?: boolean;
  product?: { price?: string };
  addedToCart?: boolean;
  addToCartError?: string;
  addToCartUrl?: string;
}

export function GrocerySearch({ plan }: { plan: FitnessPlan }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GroceryResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<"fresh" | "wholefoods" | "amazon">("fresh");
  const [addToCart, setAddToCart] = useState(false);

  const handleFind = async () => {
    const items = plan.dietPlan.weeklyPlan
      .slice(0, 3)
      .flatMap((d) => (d.meals ?? []).map((m) => (m.description ?? "").split(",")[0].trim()))
      .filter(Boolean)
      .slice(0, 6);
    if (items.length === 0) return;

    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/act/grocery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, store, addToCart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to fetch grocery shortlist");
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fetch grocery shortlist");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6">
      <h3 className="section-title !text-base mb-2">Grocery shopping</h3>
      <p className="section-subtitle mb-4">Nova Act searches for diet-plan ingredients on Amazon</p>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="label text-xs" htmlFor="grocery-store">Store</label>
          <select id="grocery-store" value={store} onChange={(e) => setStore(e.target.value as typeof store)} className="input-base text-xs">
            <option value="fresh">Amazon Fresh</option>
            <option value="wholefoods">Whole Foods</option>
            <option value="amazon">Amazon</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={addToCart} onChange={(e) => setAddToCart(e.target.checked)} className="rounded border-[var(--border)]" />
          Add to cart
        </label>
        <button onClick={handleFind} disabled={loading} className="btn-primary text-xs">
          {loading ? "Searching..." : "Find ingredients"}
        </button>
      </div>
      {error && <p className="text-xs text-[var(--accent-terracotta)] mb-2">{error}</p>}
      {results && results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs rounded-lg bg-[var(--surface-elevated)] px-3 py-2">
              <span>{r.searchTerm}</span>
              <span className="flex items-center gap-1.5 text-[var(--muted)]">
                {r.found ? (r.product?.price ?? "found") : "not found"}
                {r.addedToCart && "· added"}
                {r.addToCartUrl && (
                  <a href={r.addToCartUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                    Add to cart
                  </a>
                )}
                {r.addToCartError && `· ${r.addToCartError}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
