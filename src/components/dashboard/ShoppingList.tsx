"use client";

import { useState, useEffect, useCallback } from "react";
import { buildShoppingListFromPlan } from "@/lib/shopping-list";
import { callActDirect, isActServiceConfigured } from "@/lib/act-client";
import type { FitnessPlan } from "@/lib/types";

interface GroceryResult {
  searchTerm: string;
  found?: boolean;
  product?: { name?: string; price?: string; available?: boolean };
  addedToCart?: boolean;
  addToCartUrl?: string; // search fallback when Act fails
  productUrl?: string;
  source?: string;
  error?: string;
}

interface GroceryResponse {
  results?: GroceryResult[];
  note?: string;
  error?: string;
}

const BATCH_SIZE = 5;

function getShoppingList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("recomp_shopping_list");
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveShoppingList(items: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("recomp_shopping_list", JSON.stringify(items));
}

export function ShoppingList({ plan }: { plan: FitnessPlan | null }) {
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [sending, setSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<GroceryResult[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(getShoppingList());
  }, []);

  const persist = useCallback((next: string[]) => {
    setItems(next);
    saveShoppingList(next);
  }, []);

  const handleLoadFromPlan = () => {
    if (!plan) return;
    const fromPlan = buildShoppingListFromPlan(plan);
    if (fromPlan.length === 0) return;
    persist(fromPlan);
  };

  const handleAddItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    setNewItem("");
    persist([...items, trimmed]);
  };

  const handleRemove = (index: number) => {
    persist(items.filter((_, i) => i !== index));
  };

  const handleSendToAmazon = async () => {
    if (items.length === 0) {
      setError("Add items or load from your plan first.");
      return;
    }

    const batches: string[][] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    setSending(true);
    setError(null);
    setNote(null);
    setResults([]);

    const allResults: GroceryResult[] = [];

    try {
      for (let i = 0; i < batches.length; i++) {
        setBatchProgress({ current: i + 1, total: batches.length });
        const payload = { items: batches[i], store: "amazon" };

        let data: GroceryResponse;
        try {
          if (isActServiceConfigured()) {
            data = await callActDirect<GroceryResponse>("/grocery", payload, { timeoutMs: 480_000 });
          } else {
            const res = await fetch("/api/act/grocery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            data = await res.json();
            if (!res.ok && data.error) { setError(data.error); break; }
          }
        } catch {
          // Timeout or network error — show search fallback links for this batch
          setNote("Request timed out. Click search links below to add manually.");
          const fallback = batches[i].map((item) => ({
            searchTerm: item,
            found: true,
            addedToCart: false,
            product: { name: item, price: "—", available: true },
            addToCartUrl: `https://www.amazon.com/s?k=${encodeURIComponent(item)}`,
            source: "fallback",
          }));
          allResults.push(...fallback);
          setResults([...allResults]);
          continue;
        }

        if (data.error && !data.results?.length) {
          setError(data.error);
          break;
        }

        if (data.note) setNote(data.note);
        const batchResults = Array.isArray(data.results) ? data.results : [];
        allResults.push(...batchResults);
        setResults([...allResults]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search Amazon");
    } finally {
      setSending(false);
      setBatchProgress(null);
    }
  };

  const addedCount = results.filter((r) => r.addedToCart).length;

  return (
    <div className="card p-6">
      <h3 className="section-title !text-base mb-1">Shopping list</h3>
      <p className="section-subtitle mb-4">
        Build a list from your diet plan. Search Amazon for each item and add to cart.
      </p>

      {/* Load from plan */}
      {plan && (
        <div className="mb-4">
          <button
            type="button"
            onClick={handleLoadFromPlan}
            disabled={sending}
            className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
          >
            Load from my meal plan
          </button>
        </div>
      )}

      {/* Item list */}
      <div className="space-y-2 mb-4">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No items yet. Add below or load from your meal plan.</p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {items.map((item, i) => (
              <li key={`${i}-${item}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-sm">
                <span className="truncate">{item}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  disabled={sending}
                  className="shrink-0 text-[var(--muted)] hover:text-[var(--accent-terracotta)] disabled:opacity-50"
                  aria-label={`Remove ${item}`}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddItem())}
            placeholder="Add an item..."
            className="input-base flex-1 text-sm"
            disabled={sending}
          />
          <button
            type="button"
            onClick={handleAddItem}
            disabled={sending || !newItem.trim()}
            className="btn-secondary !py-2 text-sm"
          >
            Add
          </button>
        </div>
      </div>

      {/* Search Amazon */}
      <div className="mb-4">
        <button
          type="button"
          onClick={handleSendToAmazon}
          disabled={sending || items.length === 0}
          className="btn-primary text-sm"
        >
          {sending && batchProgress
            ? `Searching Amazon… (batch ${batchProgress.current}/${batchProgress.total})`
            : "Search Amazon"}
        </button>
      </div>

      {error && <p className="text-sm text-[var(--accent-terracotta)] mb-2" role="alert">{error}</p>}
      {note && !error && <p className="text-sm text-[var(--muted)] mb-2">{note}</p>}

      {/* Individual results */}
      {results.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-[var(--border-soft)]">
          <p className="text-xs font-medium text-[var(--muted)]">
            {addedCount > 0 ? `Added ${addedCount} of ${results.length} to cart` : `Found ${results.filter((r) => r.found).length} of ${results.length} items`}
          </p>
          {results.map((r, i) => (
            <div
              key={`${i}-${r.searchTerm}`}
              className="flex items-center justify-between gap-2 text-sm rounded-lg bg-[var(--surface-elevated)] px-3 py-2"
            >
              <span className="truncate">{r.searchTerm}</span>
              <span className="shrink-0 flex items-center gap-2 text-[var(--muted)] text-xs">
                {r.found ? (r.product?.price ?? "Found") : "Not found"}
                {r.addedToCart && "· In cart"}
                {r.productUrl && (
                  <a
                    href={r.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline"
                    title="View product on Amazon"
                  >
                    View
                  </a>
                )}
                {r.addToCartUrl && !r.addedToCart && (
                  <a
                    href={r.addToCartUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline"
                  >
                    Search on Amazon
                  </a>
                )}
                {r.error && `· ${r.error}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
