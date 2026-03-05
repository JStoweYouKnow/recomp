"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/Toast";
import { getMyGroups, saveMyGroups, getProfile, getMeals, getWorkoutProgress, getWearableData, getXP, getPlan } from "@/lib/storage";
import { getTodayLocal } from "@/lib/date-utils";
import type { GroupMembership, Group, Challenge, ChallengeMetric } from "@/lib/types";

const GOAL_LABELS: Record<string, string> = {
  lose_weight: "Lose Weight",
  build_muscle: "Build Muscle",
  consistency: "Consistency",
  macro_targets: "Macro Targets",
  custom: "Custom",
};

const GOAL_ICONS: Record<string, string> = {
  lose_weight: "🏃",
  build_muscle: "💪",
  consistency: "📅",
  macro_targets: "🎯",
  custom: "⭐",
};

const CHALLENGE_METRICS: { value: ChallengeMetric; label: string }[] = [
  { value: "meal_streak", label: "Meal streak (days)" },
  { value: "macro_accuracy", label: "Macro accuracy %" },
  { value: "workout_completion", label: "Workouts completed" },
  { value: "steps", label: "Steps" },
  { value: "xp_gained", label: "XP gained" },
];

export function GroupsView({
  onSelectGroup,
  onCreateGroup,
}: {
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: () => void;
}) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"mine" | "discover" | "challenges">("mine");
  const [myGroups, setMyGroups] = useState<GroupMembership[]>(() => getMyGroups());
  const [openGroups, setOpenGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeJoinId, setChallengeJoinId] = useState("");
  const [challengeJoinLoading, setChallengeJoinLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState<"solo" | "duel">("solo");
  const [createMetric, setCreateMetric] = useState<ChallengeMetric>("meal_streak");
  const [createTarget, setCreateTarget] = useState("");
  const [createStart, setCreateStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [createEnd, setCreateEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [progressSyncing, setProgressSyncing] = useState<string | null>(null);

  const fetchMyGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        setMyGroups(data);
        saveMyGroups(data);
      }
    } catch {
      // use cached
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOpenGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups/discover");
      if (res.ok) {
        const data = await res.json();
        setOpenGroups(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchMyGroups();
  }, [fetchMyGroups]);

  const fetchChallenges = useCallback(async () => {
    setChallengeLoading(true);
    try {
      const res = await fetch("/api/challenges");
      if (res.ok) {
        const data = await res.json();
        setChallenges(Array.isArray(data) ? data : []);
      }
    } catch {
      setChallenges([]);
    } finally {
      setChallengeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "discover") fetchOpenGroups();
  }, [tab, fetchOpenGroups]);

  useEffect(() => {
    if (tab === "challenges") fetchChallenges();
  }, [tab, fetchChallenges]);

  const handleCreateChallenge = async () => {
    const targetNum = parseFloat(createTarget);
    if (!createTitle.trim() || !Number.isFinite(targetNum) || targetNum <= 0) {
      showToast("Fill title and target", "info");
      return;
    }
    setCreateLoading(true);
    try {
      const profile = getProfile();
      const res = await fetch("/api/challenges/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle.trim(),
          description: "",
          type: createType,
          metric: createMetric,
          target: targetNum,
          startDate: createStart,
          endDate: createEnd,
          userName: profile?.name ?? "You",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCreateOpen(false);
      setCreateTitle("");
      setCreateTarget("");
      fetchChallenges();
      showToast("Challenge created!", "success");
    } catch {
      showToast("Failed to create challenge", "error");
    } finally {
      setCreateLoading(false);
    }
  };

  const computeChallengeProgress = useCallback((c: Challenge): number => {
    const meals = getMeals();
    const workoutProgress = getWorkoutProgress();
    const wearable = getWearableData();
    const xp = getXP();
    const plan = getPlan();
    const today = getTodayLocal();

    switch (c.metric) {
      case "meal_streak": {
        const dates = [...new Set(meals.map((m) => m.date))].sort();
        if (dates.length === 0) return 0;
        let streak = 0;
        for (let i = dates.length - 1; i >= 0; i--) {
          const expect = new Date(today);
          expect.setDate(expect.getDate() - streak);
          if (dates[i] === expect.toISOString().slice(0, 10)) streak++;
          else break;
        }
        return streak;
      }
      case "macro_accuracy": {
        const targets = plan?.dietPlan?.dailyTargets;
        if (!targets) return 0;
        const recent = meals.filter((m) => m.date >= new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
        const byDate = new Map<string, { calories: number; protein: number }>();
        for (const m of recent) {
          const cur = byDate.get(m.date) ?? { calories: 0, protein: 0 };
          cur.calories += m.macros.calories;
          cur.protein += m.macros.protein;
          byDate.set(m.date, cur);
        }
        let hit = 0;
        let total = 0;
        for (const [, t] of byDate) {
          total++;
          const calOk = Math.abs(t.calories - targets.calories) / targets.calories <= 0.15;
          const proOk = t.protein >= targets.protein * 0.9;
          if (calOk && proOk) hit++;
        }
        return total ? Math.round((hit / total) * 100) : 0;
      }
      case "workout_completion": {
        const weekKeys = Object.keys(workoutProgress);
        return weekKeys.filter((k) => workoutProgress[k]).length;
      }
      case "steps": {
        const todaySteps = wearable.find((d) => d.date === today)?.steps ?? 0;
        const total = wearable.reduce((s, d) => s + (d.steps ?? 0), 0);
        return total > 0 ? total : todaySteps;
      }
      case "xp_gained":
        return xp;
      default:
        return 0;
    }
  }, []);

  const syncChallengeProgress = useCallback(async (c: Challenge) => {
    if (c.status !== "active") return;
    setProgressSyncing(c.id);
    try {
      const progress = computeChallengeProgress(c);
      const res = await fetch("/api/challenges/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: c.id, progress, score: progress }),
      });
      if (res.ok) {
        fetchChallenges();
        showToast("Progress synced");
      }
    } catch {
      showToast("Failed to sync progress", "error");
    } finally {
      setProgressSyncing(null);
    }
  }, [computeChallengeProgress, fetchChallenges, showToast]);

  const handleJoinChallenge = async () => {
    if (!challengeJoinId.trim()) return;
    setChallengeJoinLoading(true);
    try {
      const profile = getProfile();
      const res = await fetch("/api/challenges/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challengeJoinId.trim(), userName: profile?.name ?? "You" }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChallengeJoinId("");
      fetchChallenges();
      showToast("Joined challenge!", "success");
    } catch {
      showToast("Failed to join challenge", "error");
    } finally {
      setChallengeJoinLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const res = await fetch("/api/groups/join-by-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Joined ${data.groupName ?? "group"}!`, "success");
        setJoinCode("");
        fetchMyGroups();
      } else {
        showToast(data.error || "Failed to join", "error");
      }
    } catch {
      showToast("Failed to join group", "error");
    } finally {
      setJoining(false);
    }
  };

  const handleJoinOpen = async (groupId: string) => {
    try {
      const res = await fetch(`/api/groups/${groupId}/join`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast("Joined group!", "success");
        fetchMyGroups();
        fetchOpenGroups();
      } else {
        showToast(data.error || "Failed to join", "error");
      }
    } catch {
      showToast("Failed to join group", "error");
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-1">
        <h2 className="section-title !text-xl">Groups</h2>
        <button type="button" onClick={onCreateGroup} className="btn-primary !py-2 !px-4 !text-sm">
          Create group
        </button>
      </div>
      <p className="section-subtitle mb-4">Join groups with shared goals and stay accountable together.</p>

      {/* Join by code */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter invite code"
            className="input-base flex-1"
            maxLength={20}
          />
          <button
            type="button"
            onClick={handleJoinByCode}
            disabled={joining || !joinCode.trim()}
            className="btn-secondary !py-2 whitespace-nowrap"
          >
            {joining ? "Joining…" : "Join"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl bg-[var(--surface-elevated)]">
        {(["mine", "discover", "challenges"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
              tab === t
                ? "bg-white text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t === "mine" ? "My Groups" : t === "discover" ? "Discover" : "Challenges"}
          </button>
        ))}
      </div>

      {/* My Groups */}
      {tab === "mine" && (
        <div className="space-y-3">
          {loading ? (
            <div className="card p-6 text-center text-sm text-[var(--muted)]">Loading groups…</div>
          ) : myGroups.length === 0 ? (
            <div className="card p-6 text-center space-y-3">
              <p className="text-sm text-[var(--muted)]">You haven&apos;t joined any groups yet.</p>
              <button type="button" onClick={onCreateGroup} className="btn-primary !py-2 !px-6 !text-sm">
                Create your first group
              </button>
            </div>
          ) : (
            myGroups.map((g) => (
              <button
                key={g.groupId}
                type="button"
                onClick={() => onSelectGroup(g.groupId)}
                className="card p-4 w-full text-left hover:border-[var(--accent)]/50 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)]">{g.groupName}</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {g.role === "owner" ? "Owner" : "Member"} · Joined {new Date(g.joinedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-[var(--muted)] text-lg">→</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Discover */}
      {tab === "discover" && (
        <div className="space-y-3">
          {openGroups.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-sm text-[var(--muted)]">No open groups available yet. Create one!</p>
            </div>
          ) : (
            openGroups.map((g) => {
              const alreadyMember = myGroups.some((m) => m.groupId === g.id);
              return (
                <div key={g.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{GOAL_ICONS[g.goalType] ?? "⭐"}</span>
                        <h3 className="font-semibold text-[var(--foreground)] truncate">{g.name}</h3>
                      </div>
                      {g.description && (
                        <p className="text-sm text-[var(--muted)] mt-1 line-clamp-2">{g.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted)]">
                        <span>{GOAL_LABELS[g.goalType] ?? g.goalType}</span>
                        <span>{g.memberCount} member{g.memberCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    {alreadyMember ? (
                      <button
                        type="button"
                        onClick={() => onSelectGroup(g.id)}
                        className="btn-secondary !py-1.5 !px-3 !text-xs whitespace-nowrap"
                      >
                        View
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleJoinOpen(g.id)}
                        className="btn-primary !py-1.5 !px-3 !text-xs whitespace-nowrap"
                      >
                        Join
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Challenges */}
      {tab === "challenges" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary !py-2 !px-4 !text-sm">
              Create challenge
            </button>
            <div className="flex gap-2 flex-1 min-w-[200px]">
              <input
                type="text"
                value={challengeJoinId}
                onChange={(e) => setChallengeJoinId(e.target.value)}
                placeholder="Challenge ID to join"
                className="input-base flex-1 text-sm"
              />
              <button
                type="button"
                onClick={handleJoinChallenge}
                disabled={challengeJoinLoading || !challengeJoinId.trim()}
                className="btn-secondary !py-2 !px-3 !text-sm disabled:opacity-50"
              >
                {challengeJoinLoading ? "Joining…" : "Join"}
              </button>
            </div>
          </div>
          {createOpen && (
            <div className="card p-4 space-y-3">
              <h3 className="font-semibold text-sm">New challenge</h3>
              <input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Title (e.g. 7-day meal streak)"
                className="input-base w-full text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateType("solo")}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition ${
                    createType === "solo"
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border-soft)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Solo
                </button>
                <button
                  type="button"
                  onClick={() => setCreateType("duel")}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition ${
                    createType === "duel"
                      ? "border-[var(--accent-warm)] bg-[var(--accent-warm)]/10 text-[var(--accent-warm)]"
                      : "border-[var(--border-soft)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Duel
                </button>
              </div>
              <select
                value={createMetric}
                onChange={(e) => setCreateMetric(e.target.value as ChallengeMetric)}
                className="input-base w-full text-sm"
              >
                {CHALLENGE_METRICS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={createTarget}
                  onChange={(e) => setCreateTarget(e.target.value)}
                  placeholder="Target"
                  className="input-base text-sm"
                />
                <input
                  type="date"
                  value={createEnd}
                  onChange={(e) => setCreateEnd(e.target.value)}
                  className="input-base text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary !py-1.5 !text-xs">
                  Cancel
                </button>
                <button type="button" onClick={handleCreateChallenge} disabled={createLoading} className="btn-primary !py-1.5 !text-xs disabled:opacity-50">
                  {createLoading ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          )}
          {challengeLoading ? (
            <div className="card p-6 text-center text-sm text-[var(--muted)]">Loading challenges…</div>
          ) : challenges.length === 0 ? (
            <div className="card p-6 text-center space-y-2">
              <p className="text-sm text-[var(--muted)]">No challenges yet. Create one or join by ID.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {challenges.map((c) => {
                const myProgress = (c as Challenge & { myProgress?: number }).myProgress ?? c.participants[0]?.progress ?? 0;
                const pct = c.target > 0 ? Math.min(100, Math.round((myProgress / c.target) * 100)) : 0;
                return (
                  <div key={c.id} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-[var(--foreground)]">{c.title}</h3>
                        <p className="text-xs text-[var(--muted)] mt-0.5">
                          {CHALLENGE_METRICS.find((m) => m.value === c.metric)?.label ?? c.metric} · {c.target} target
                        </p>
                        <p className="text-[10px] text-[var(--muted)] mt-1">ID: {c.id.slice(0, 8)}… · Ends {c.endDate}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${c.status === "active" ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--surface-elevated)] text-[var(--muted)]"}`}>
                        {c.status}
                      </span>
                    </div>
                    {c.status === "active" && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Progress</span>
                          <span>{myProgress} / {c.target}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
                          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <button
                          type="button"
                          onClick={() => syncChallengeProgress(c)}
                          disabled={progressSyncing === c.id}
                          className="mt-2 text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
                        >
                          {progressSyncing === c.id ? "Syncing…" : "Sync progress"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
