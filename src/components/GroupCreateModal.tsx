"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import type { GroupAccessMode, GroupTrackingMode, GroupGoalType } from "@/lib/types";

const GOAL_OPTIONS: { value: GroupGoalType; label: string; icon: string }[] = [
  { value: "lose_weight", label: "Lose Weight", icon: "🏃" },
  { value: "build_muscle", label: "Build Muscle", icon: "💪" },
  { value: "consistency", label: "Consistency", icon: "📅" },
  { value: "macro_targets", label: "Macro Targets", icon: "🎯" },
  { value: "custom", label: "Custom", icon: "⭐" },
];

const TRACKING_OPTIONS: { value: GroupTrackingMode; label: string; desc: string }[] = [
  { value: "aggregate", label: "Aggregate only", desc: "Show combined group stats without singling out members." },
  { value: "leaderboard", label: "Leaderboard", desc: "Ranked leaderboard of member progress. Most competitive." },
  { value: "both", label: "Both", desc: "Show group totals and individual rankings." },
];

export function GroupCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState<GroupGoalType>("consistency");
  const [goalDescription, setGoalDescription] = useState("");
  const [accessMode, setAccessMode] = useState<GroupAccessMode>("open");
  const [trackingMode, setTrackingMode] = useState<GroupTrackingMode>("both");
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    if (!name.trim()) {
      showToast("Please enter a group name", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          goalType,
          goalDescription: goalType === "custom" ? goalDescription.trim() : undefined,
          accessMode,
          trackingMode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Group created!", "success");
        onCreated(data.id);
        onClose();
      } else {
        showToast(data.error || "Failed to create group", "error");
      }
    } catch {
      showToast("Failed to create group", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div
        className="relative bg-[var(--background)] rounded-2xl border border-[var(--border)] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Create a group</h2>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)] text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="label">Group name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning Runners"
              className="input-base w-full"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about?"
              className="input-base w-full resize-none"
              rows={2}
              maxLength={500}
            />
          </div>

          {/* Goal type */}
          <div>
            <label className="label mb-2 block">Goal</label>
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGoalType(opt.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition ${
                    goalType === opt.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  <span>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            {goalType === "custom" && (
              <input
                type="text"
                value={goalDescription}
                onChange={(e) => setGoalDescription(e.target.value)}
                placeholder="Describe the custom goal"
                className="input-base w-full mt-2"
                maxLength={300}
              />
            )}
          </div>

          {/* Access mode */}
          <div>
            <label className="label mb-2 block">Access</label>
            <div className="flex gap-2">
              {([
                { value: "open" as GroupAccessMode, label: "Open", desc: "Anyone can find and join" },
                { value: "invite_only" as GroupAccessMode, label: "Invite only", desc: "Join via invite code" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAccessMode(opt.value)}
                  className={`flex-1 p-3 rounded-xl border text-left transition ${
                    accessMode === opt.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--border)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  <span className="text-sm font-medium text-[var(--foreground)]">{opt.label}</span>
                  <p className="text-xs text-[var(--muted)] mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Tracking mode */}
          <div>
            <label className="label mb-2 block">Progress tracking</label>
            <div className="space-y-2">
              {TRACKING_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    trackingMode === opt.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--border)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="tracking"
                    value={opt.value}
                    checked={trackingMode === opt.value}
                    onChange={() => setTrackingMode(opt.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--foreground)]">{opt.label}</span>
                    <p className="text-xs text-[var(--muted)] mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="btn-primary w-full !py-2.5"
          >
            {creating ? "Creating…" : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}
