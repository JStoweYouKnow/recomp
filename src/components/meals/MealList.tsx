"use client";

import { useState } from "react";
import type { MealEntry } from "@/lib/types";

export function MealList({
  dateLabel,
  isViewingToday,
  displayMeals,
  mealsByCategory,
  onEditMeal,
  onDeleteMeal,
  onShowAdd,
  onVoiceLog,
  onPhotoLog,
  voiceLoading,
  photoLoading,
}: {
  dateLabel: string;
  isViewingToday: boolean;
  displayMeals: MealEntry[];
  mealsByCategory: { category: MealEntry["mealType"]; meals: MealEntry[] }[];
  onEditMeal: (m: MealEntry) => void;
  onDeleteMeal: (id: string) => void;
  onShowAdd: () => void;
  onVoiceLog: () => void;
  onPhotoLog: (e: React.ChangeEvent<HTMLInputElement>) => void;
  voiceLoading: boolean;
  photoLoading: boolean;
}) {
  const [editDraft, setEditDraft] = useState<MealEntry | null>(null);

  const handleSaveEdit = () => {
    if (!editDraft) return;
    onEditMeal(editDraft);
    setEditDraft(null);
  };

  return (
    <div>
      <h3 className="section-title !text-base mb-3">{dateLabel}&apos;s meals</h3>
      {displayMeals.length === 0 ? (
        <div className={`rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-elevated)]/50 p-8 text-center ${isViewingToday ? "animate-fade-in" : ""}`}>
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] mb-4" aria-hidden>
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v10.024c0 1.135.845 2.098 1.976 2.192.332.05.664.083 1.002.083.337 0 .67-.033 1.003-.083C10.303 20.944 11.645 21 13 21c1.355 0 2.697-.056 4.024-.166C18.155 20.49 19 19.527 19 18.392V10.608c0-1.135-.845-2.098-1.976-2.192A13.413 13.413 0 0013 8.25m0 0l.001-.001" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {isViewingToday ? "Log your first meal" : "No meals for this date"}
          </p>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {isViewingToday
              ? "Try one of these quick options to get started."
              : "Log meals on that day or switch to today."}
          </p>
          {isViewingToday && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button onClick={onShowAdd} className="btn-primary !text-xs">
                Add manually
              </button>
              <button onClick={onVoiceLog} disabled={voiceLoading} className="btn-secondary !text-xs">
                {voiceLoading ? "Listening…" : "Voice log"}
              </button>
              <label className="btn-secondary !text-xs cursor-pointer">
                <input type="file" accept="image/*" capture="environment" onChange={onPhotoLog} className="sr-only" />
                {photoLoading ? "Analyzing…" : "Snap plate"}
              </label>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 max-w-2xl">
          {mealsByCategory.map(({ category, meals }) => (
            <div key={category}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {meals.map((m) => (
                  <li key={m.id}>
                    {editDraft?.id === m.id ? (
                      <div className="card p-3 space-y-3 animate-slide-up max-w-2xl">
                        <h4 className="text-sm font-semibold">Edit meal</h4>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="label !mb-1">Name</label>
                            <input
                              value={editDraft.name}
                              onChange={(e) => setEditDraft((d) => d ? { ...d, name: e.target.value } : null)}
                              className="input-base rounded-lg px-2 py-2 text-sm w-full"
                            />
                          </div>
                          <div>
                            <label className="label !mb-1">Date</label>
                            <input
                              type="date"
                              value={editDraft.date}
                              onChange={(e) => setEditDraft((d) => d ? { ...d, date: e.target.value } : null)}
                              className="input-base rounded-lg px-2 py-2 text-sm w-full"
                            />
                          </div>
                          <div>
                            <label className="label !mb-1">Meal type</label>
                            <select
                              value={editDraft.mealType}
                              onChange={(e) => setEditDraft((d) => d ? { ...d, mealType: e.target.value as MealEntry["mealType"] } : null)}
                              className="input-base rounded-lg px-2 py-2 text-sm w-full"
                            >
                              <option value="breakfast">Breakfast</option>
                              <option value="lunch">Lunch</option>
                              <option value="dinner">Dinner</option>
                              <option value="snack">Snack</option>
                            </select>
                          </div>
                          <div>
                            <label className="label !mb-1">Notes (optional)</label>
                            <input
                              value={editDraft.notes ?? ""}
                              onChange={(e) => setEditDraft((d) => d ? { ...d, notes: e.target.value || undefined } : null)}
                              placeholder="e.g. Restaurant, portion size"
                              className="input-base rounded-lg px-2 py-2 text-sm w-full"
                            />
                          </div>
                          <div className="sm:col-span-2 grid grid-cols-4 gap-2">
                            <div>
                              <label className="label !mb-1 text-center">Cal</label>
                              <input
                                type="number"
                                min={0}
                                value={editDraft.macros.calories || ""}
                                onChange={(e) => setEditDraft((d) => d ? { ...d, macros: { ...d.macros, calories: parseInt(e.target.value) || 0 } } : null)}
                                className="input-base rounded-lg px-1.5 py-2 text-sm w-full text-center hide-spinners"
                              />
                            </div>
                            <div>
                              <label className="label !mb-1 text-center">P (g)</label>
                              <input
                                type="number"
                                min={0}
                                value={editDraft.macros.protein || ""}
                                onChange={(e) => setEditDraft((d) => d ? { ...d, macros: { ...d.macros, protein: parseInt(e.target.value) || 0 } } : null)}
                                className="input-base rounded-lg px-1.5 py-2 text-sm w-full text-center hide-spinners"
                              />
                            </div>
                            <div>
                              <label className="label !mb-1 text-center">C (g)</label>
                              <input
                                type="number"
                                min={0}
                                value={editDraft.macros.carbs || ""}
                                onChange={(e) => setEditDraft((d) => d ? { ...d, macros: { ...d.macros, carbs: parseInt(e.target.value) || 0 } } : null)}
                                className="input-base rounded-lg px-1.5 py-2 text-sm w-full text-center hide-spinners"
                              />
                            </div>
                            <div>
                              <label className="label !mb-1 text-center">F (g)</label>
                              <input
                                type="number"
                                min={0}
                                value={editDraft.macros.fat || ""}
                                onChange={(e) => setEditDraft((d) => d ? { ...d, macros: { ...d.macros, fat: parseInt(e.target.value) || 0 } } : null)}
                                className="input-base rounded-lg px-1.5 py-2 text-sm w-full text-center hide-spinners"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleSaveEdit} className="btn-primary !text-sm">Save</button>
                          <button onClick={() => setEditDraft(null)} className="btn-secondary !text-sm">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 card card-compact rounded-lg">
                        {m.imageUrl && (
                          <img src={m.imageUrl} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{m.name}</p>
                          <p className="text-[10px] text-[var(--muted)]">{m.macros.calories} cal · {m.macros.protein}g P</p>
                        </div>
                        <div className="flex gap-0.5 flex-shrink-0">
                          <button onClick={() => setEditDraft({ ...m })} className="btn-ghost btn-compact text-label text-[var(--muted)] hover:text-[var(--accent)]">Edit</button>
                          <button onClick={() => onDeleteMeal(m.id)} className="btn-ghost btn-compact text-label text-[var(--muted)] hover:text-[var(--accent-terracotta)]">Del</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
