"use client";

import { useState } from "react";
import type { PantryItem } from "@/lib/types";
import { getPantry, savePantry } from "@/lib/storage";
import { syncToServer } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";

const CATEGORIES: PantryItem["category"][] = ["protein", "carb", "fat", "produce", "dairy", "spice", "other"];

export function PantrySection() {
  const [items, setItems] = useState<PantryItem[]>(() => getPantry());
  const [expanded, setExpanded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<PantryItem["category"]>("produce");

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const entry: PantryItem = {
      id: uuidv4(),
      name,
      category: newCategory,
      addedAt: new Date().toISOString(),
    };
    const next = [...items, entry];
    setItems(next);
    savePantry(next);
    syncToServer();
    setNewName("");
  };

  const remove = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    savePantry(next);
    syncToServer();
  };

  return (
    <div className="card rounded-xl p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <h4 className="font-semibold text-sm">Pantry</h4>
        <span className="text-xs text-[var(--muted)]">
          {items.length} items {expanded ? "▼" : "▶"}
        </span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 animate-fade-in">
          <p className="text-xs text-[var(--muted)]">Context-aware meal suggestions use your pantry. Add items you have on hand.</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. chicken breast"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="input-base rounded-lg px-3 py-2 text-sm flex-1"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as PantryItem["category"])}
              className="input-base rounded-lg px-2 py-2 text-sm w-auto min-w-[7rem] flex-shrink-0"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button type="button" onClick={add} disabled={!newName.trim()} className="btn-primary text-sm py-2 px-3 disabled:opacity-50">
              Add
            </button>
          </div>
          {items.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {items.map((i) => (
                <span
                  key={i.id}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-soft)] px-2.5 py-1 text-xs"
                >
                  {i.name}
                  <button type="button" onClick={() => remove(i.id)} className="text-[var(--muted)] hover:text-[var(--accent-terracotta)]" aria-label={`Remove ${i.name}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
