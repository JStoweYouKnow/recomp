"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/components/Toast";
import { saveCachedGroup, saveCachedGroupMessages, getCachedGroupMessages, getProfile } from "@/lib/storage";
import type { Group, GroupMembership, GroupMessage, GroupMemberProgress, GroupTrackingMode, Challenge, ChallengeMetric } from "@/lib/types";

const CHALLENGE_METRICS: { value: ChallengeMetric; label: string }[] = [
  { value: "meal_streak", label: "Meal streak" },
  { value: "macro_accuracy", label: "Macro accuracy" },
  { value: "workout_completion", label: "Workouts" },
  { value: "steps", label: "Steps" },
  { value: "xp_gained", label: "XP" },
];

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

function xpToLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function GroupDetailView({
  groupId,
  onBack,
}: {
  groupId: string;
  onBack: () => void;
}) {
  const { showToast } = useToast();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMembership[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>(() => getCachedGroupMessages(groupId));
  const [progress, setProgress] = useState<GroupMemberProgress[]>([]);
  const [aggregate, setAggregate] = useState<{ totalXp: number; averageStreak: number; averageMacroHitRate: number; memberCount: number } | null>(null);
  const [trackingMode, setTrackingMode] = useState<GroupTrackingMode>("both");
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showChallenges, setShowChallenges] = useState(false);
  const [groupChallenges, setGroupChallenges] = useState<Challenge[]>([]);
  const [leaderboardSort, setLeaderboardSort] = useState<"xp" | "streak" | "macro">("xp");
  const [leaderboardView, setLeaderboardView] = useState<"week" | "all">("all");
  const [activeTab, setActiveTab] = useState<"chat" | "activity">("chat");
  const [createChallengeOpen, setCreateChallengeOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createMetric, setCreateMetric] = useState<ChallengeMetric>("meal_streak");
  const [createTarget, setCreateTarget] = useState("");
  const [createEnd, setCreateEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [createLoading, setCreateLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      if (res.ok) {
        const data = await res.json();
        setGroup(data.group);
        setMembers(data.members);
        saveCachedGroup(data.group);
      }
    } catch {}
  }, [groupId]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
        saveCachedGroupMessages(groupId, data);
      }
    } catch {}
  }, [groupId]);

  const handlePinToggle = async (msg: GroupMessage) => {
    const pinned = !msg.pinnedAt;
    try {
      const res = await fetch(
        `/api/groups/${groupId}/messages/${msg.id}?ts=${encodeURIComponent(msg.createdAt)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? updated : m))
        );
        saveCachedGroupMessages(
          groupId,
          messages.map((m) => (m.id === msg.id ? updated : m))
        );
      }
    } catch {
      showToast("Failed to update pin", "error");
    }
  };

  const fetchGroupChallenges = useCallback(async () => {
    try {
      const res = await fetch("/api/challenges");
      if (res.ok) {
        const all = await res.json();
        setGroupChallenges(Array.isArray(all) ? all.filter((c: Challenge) => c.groupId === groupId) : []);
      }
    } catch {}
  }, [groupId]);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/progress`);
      if (res.ok) {
        const data = await res.json();
        setProgress(data.leaderboard);
        setAggregate(data.aggregate);
        setTrackingMode(data.trackingMode);
      }
    } catch {}
  }, [groupId]);

  useEffect(() => {
    Promise.all([fetchGroup(), fetchMessages(), fetchProgress(), fetchGroupChallenges()]).finally(() => setLoading(false));
  }, [fetchGroup, fetchMessages, fetchProgress, fetchGroupChallenges]);

  // Poll messages every 30s
  useEffect(() => {
    pollRef.current = setInterval(fetchMessages, 30_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  // Auto-scroll messages on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newMessage.trim() }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        saveCachedGroupMessages(groupId, [...messages, msg]);
        setNewMessage("");
      }
    } catch {
      showToast("Failed to send message", "error");
    } finally {
      setSending(false);
    }
  };

  const handleCreateGroupChallenge = async () => {
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
          type: "group",
          metric: createMetric,
          target: targetNum,
          startDate: new Date().toISOString().slice(0, 10),
          endDate: createEnd,
          groupId,
          userName: profile?.name ?? "You",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCreateChallengeOpen(false);
      setCreateTitle("");
      setCreateTarget("");
      fetchGroupChallenges();
      showToast("Challenge created!");
    } catch {
      showToast("Failed to create challenge", "error");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm("Are you sure you want to leave this group?")) return;
    try {
      const res = await fetch(`/api/groups/${groupId}/leave`, { method: "POST" });
      if (res.ok) {
        showToast("Left group", "success");
        onBack();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to leave", "error");
      }
    } catch {
      showToast("Failed to leave group", "error");
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <button type="button" onClick={onBack} className="text-sm text-[var(--accent)] mb-4 hover:underline">
          ← Back to groups
        </button>
        <div className="card p-6 text-center text-sm text-[var(--muted)]">Loading group…</div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="animate-fade-in">
        <button type="button" onClick={onBack} className="text-sm text-[var(--accent)] mb-4 hover:underline">
          ← Back to groups
        </button>
        <div className="card p-6 text-center text-sm text-[var(--muted)]">Group not found</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <button type="button" onClick={onBack} className="text-sm text-[var(--accent)] mb-4 hover:underline">
        ← Back to groups
      </button>

      {/* ── Info section ── */}
      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">{GOAL_ICONS[group.goalType] ?? "⭐"}</span>
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)]">{group.name}</h2>
              {group.description && (
                <p className="text-sm text-[var(--muted)] mt-1">{group.description}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLeave}
            className="text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)] transition shrink-0"
          >
            Leave
          </button>
        </div>

        {/* Quick stats row */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent)]/10 text-xs font-medium text-[var(--accent)]">
            {GOAL_LABELS[group.goalType] ?? group.goalType}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-elevated)] text-xs text-[var(--muted)]">
            {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-elevated)] text-xs text-[var(--muted)] capitalize">
            {group.accessMode.replace("_", " ")}
          </span>
          {group.goalDescription && (
            <span className="text-xs text-[var(--muted)] italic">{group.goalDescription}</span>
          )}
        </div>

        {/* Invite code */}
        {group.inviteCode && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--muted)]">Invite code:</span>
            <code className="text-xs font-mono bg-[var(--surface-elevated)] px-2 py-1 rounded">{group.inviteCode}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(group.inviteCode!);
                setInviteCopied(true);
                setTimeout(() => setInviteCopied(false), 2000);
              }}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              {inviteCopied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        {/* Members row (inline avatars) */}
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() => setShowMembers(!showMembers)}
            className="flex items-center gap-2 w-full text-left"
          >
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((m, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full bg-[var(--accent)]/10 border-2 border-[var(--background)] flex items-center justify-center text-[10px] text-[var(--accent)]"
                >
                  {m.groupName.charAt(0).toUpperCase()}
                </div>
              ))}
              {members.length > 5 && (
                <div className="w-7 h-7 rounded-full bg-[var(--surface-elevated)] border-2 border-[var(--background)] flex items-center justify-center text-[10px] text-[var(--muted)]">
                  +{members.length - 5}
                </div>
              )}
            </div>
            <span className="text-xs text-[var(--muted)] flex-1">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </span>
            <span className="text-xs text-[var(--accent)]">{showMembers ? "Hide" : "Show"}</span>
          </button>

          {showMembers && (
            <div className="mt-3 space-y-2">
              {members.map((m, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <div className="w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs text-[var(--accent)]">
                    {m.groupName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-[var(--foreground)] flex-1">{m.groupName}</span>
                  {m.role === "owner" && (
                    <span className="text-[10px] font-medium text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded">Owner</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Progress / Leaderboard (collapsible) ── */}
      {(trackingMode === "aggregate" || trackingMode === "leaderboard" || trackingMode === "both") && (
        <div className="card mb-4 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowProgress(!showProgress)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">Progress &amp; Leaderboard</span>
              {aggregate && (
                <span className="text-xs text-[var(--muted)]">
                  {aggregate.totalXp.toLocaleString()} total XP
                </span>
              )}
            </div>
            <span className={`text-[var(--muted)] transition-transform ${showProgress ? "rotate-180" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </span>
          </button>

          {showProgress && (
            <div className="px-4 pb-4 space-y-4">
              {/* Aggregate stats */}
              {(trackingMode === "aggregate" || trackingMode === "both") && aggregate && (
                <div className="grid grid-cols-3 gap-4 text-center p-4 rounded-xl bg-[var(--surface-elevated)]">
                  <div>
                    <p className="text-xl font-bold text-[var(--accent)]">{aggregate.totalXp.toLocaleString()}</p>
                    <p className="text-[10px] text-[var(--muted)]">Total XP</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-[var(--accent)]">{aggregate.averageStreak}</p>
                    <p className="text-[10px] text-[var(--muted)]">Avg Streak</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-[var(--accent)]">{aggregate.averageMacroHitRate}%</p>
                    <p className="text-[10px] text-[var(--muted)]">Avg Macro Hit</p>
                  </div>
                </div>
              )}

              {/* Leaderboard */}
              {(trackingMode === "leaderboard" || trackingMode === "both") && (
                <>
                  {/* Sort & view controls */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-1">
                      {(["xp", "streak", "macro"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setLeaderboardSort(s)}
                          className={`text-[10px] px-2 py-1 rounded-full font-medium transition-all ${
                            leaderboardSort === s
                              ? "bg-[var(--accent-10)] text-[var(--accent)]"
                              : "text-[var(--muted)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {s === "xp" ? "XP" : s === "streak" ? "Streak" : "Macros"}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {(["all", "week"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setLeaderboardView(v)}
                          className={`text-[10px] px-2 py-1 rounded-full font-medium transition-all ${
                            leaderboardView === v
                              ? "bg-[var(--surface-elevated)] text-[var(--foreground)]"
                              : "text-[var(--muted)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {v === "all" ? "All Time" : "This Week"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {progress.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">No progress data yet. Members need to sync their data.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...progress]
                        .sort((a, b) => {
                          if (leaderboardSort === "streak") return b.streakLength - a.streakLength;
                          if (leaderboardSort === "macro") return b.macroHitRate - a.macroHitRate;
                          return b.xp - a.xp;
                        })
                        .map((p, i) => {
                          const profile = getProfile();
                          const isMe = profile?.id === p.userId || profile?.name === p.name;
                          const rankIcons = ["\ud83e\udd47", "\ud83e\udd48", "\ud83e\udd49"];
                          const maxVal = leaderboardSort === "streak"
                            ? Math.max(...progress.map((x) => x.streakLength), 1)
                            : leaderboardSort === "macro"
                              ? 100
                              : Math.max(...progress.map((x) => x.xp), 1);
                          const curVal = leaderboardSort === "streak" ? p.streakLength : leaderboardSort === "macro" ? p.macroHitRate : p.xp;
                          const barPct = Math.min(100, (curVal / maxVal) * 100);

                          return (
                            <div
                              key={p.userId}
                              className={`rank-entry flex items-center gap-3 p-3 rounded-xl transition-all ${
                                isMe
                                  ? "bg-[var(--accent-10)] border border-[var(--accent)]/20"
                                  : "bg-[var(--surface-elevated)]"
                              }`}
                            >
                              <span className="w-7 text-center text-sm">
                                {i < 3 ? rankIcons[i] : <span className="font-bold text-[var(--muted)]">{i + 1}</span>}
                              </span>
                              {p.avatarDataUrl ? (
                                <img src={p.avatarDataUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-sm text-[var(--accent)]">
                                  {p.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-[var(--foreground)] truncate">
                                    {p.name}
                                    {isMe && <span className="text-[10px] text-[var(--accent)] ml-1">(you)</span>}
                                  </p>
                                </div>
                                <div className="mt-1 h-1.5 rounded-full bg-[var(--border-soft)] overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                      width: `${barPct}%`,
                                      background: i === 0 ? "var(--accent)" : i === 1 ? "var(--accent-sage)" : "var(--accent-warm)",
                                    }}
                                  />
                                </div>
                                <p className="text-[10px] text-[var(--muted)] mt-0.5">
                                  Lv{xpToLevel(p.xp)} · {p.xp} XP · {p.streakLength}d streak · {p.macroHitRate}% macros
                                </p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Group challenges (collapsible) ── */}
      <div className="card mb-4 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowChallenges(!showChallenges)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="text-sm font-semibold text-[var(--foreground)]">Challenges</span>
          <span className="text-xs text-[var(--muted)]">{groupChallenges.length} active</span>
          <span className={`text-[var(--muted)] transition-transform ${showChallenges ? "rotate-180" : ""}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </span>
        </button>
        {showChallenges && (
          <div className="px-4 pb-4 space-y-3">
            {groupChallenges.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No group challenges yet. Create one to compete with members.</p>
            ) : (
              groupChallenges.map((c) => {
                const myProgress = (c as Challenge & { myProgress?: number }).myProgress ?? c.participants[0]?.progress ?? 0;
                const pct = c.target > 0 ? Math.min(100, Math.round((myProgress / c.target) * 100)) : 0;
                return (
                  <div key={c.id} className="rounded-lg border border-[var(--border-soft)] p-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-sm">{c.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.status === "active" ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--surface-elevated)] text-[var(--muted)]"}`}>{c.status}</span>
                    </div>
                    <p className="text-[10px] text-[var(--muted)] mt-0.5">{CHALLENGE_METRICS.find((m) => m.value === c.metric)?.label} · {c.target} target</p>
                    {c.status === "active" && (
                      <div className="mt-2">
                        <div className="flex justify-between text-[10px] mb-0.5"><span>Progress</span><span>{myProgress} / {c.target}</span></div>
                        <div className="h-1 overflow-hidden rounded-full bg-[var(--border-soft)]">
                          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {createChallengeOpen ? (
              <div className="rounded-lg border border-[var(--border-soft)] p-3 space-y-2">
                <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="Challenge title" className="input-base w-full text-sm" />
                <select value={createMetric} onChange={(e) => setCreateMetric(e.target.value as ChallengeMetric)} className="input-base w-full text-sm">
                  {CHALLENGE_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={createTarget} onChange={(e) => setCreateTarget(e.target.value)} placeholder="Target" className="input-base text-sm" />
                  <input type="date" value={createEnd} onChange={(e) => setCreateEnd(e.target.value)} className="input-base text-sm" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCreateChallengeOpen(false)} className="btn-secondary btn-sm">Cancel</button>
                  <button type="button" onClick={handleCreateGroupChallenge} disabled={createLoading} className="btn-primary btn-sm disabled:opacity-50">{createLoading ? "Creating…" : "Create"}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setCreateChallengeOpen(true)} className="btn-primary btn-sm w-full">
                Create group challenge
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Message board & Activity Feed ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <button
            onClick={() => setActiveTab("chat")}
            className={`text-sm font-semibold transition-colors pb-1 border-b-2 ${
              activeTab === "chat" ? "text-[var(--foreground)] border-[var(--accent)]" : "text-[var(--muted)] border-transparent hover:text-[var(--foreground)]"
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`text-sm font-semibold transition-colors pb-1 border-b-2 ${
              activeTab === "activity" ? "text-[var(--foreground)] border-[var(--accent)]" : "text-[var(--muted)] border-transparent hover:text-[var(--foreground)]"
            }`}
          >
            Activity
          </button>
        </div>

        {/* Activity Feed */}
        {activeTab === "activity" && (
          <div className="h-[400px] overflow-y-auto px-4 pb-4 space-y-2">
            {progress.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center py-12">No activity yet. Members need to sync progress.</p>
            ) : (
              progress
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .map((p) => {
                  const icons: Record<string, string> = {
                    streak: "\ud83d\udd25",
                    xp: "\u2b50",
                    macro: "\ud83c\udfaf",
                  };
                  const items = [];
                  if (p.streakLength > 0) items.push({ icon: icons.streak, text: `${p.name} is on a ${p.streakLength}-day streak`, time: p.updatedAt });
                  if (p.xp > 0) items.push({ icon: icons.xp, text: `${p.name} reached ${p.xp} XP (Level ${xpToLevel(p.xp)})`, time: p.updatedAt });
                  if (p.macroHitRate > 70) items.push({ icon: icons.macro, text: `${p.name} hitting ${p.macroHitRate}% macro accuracy`, time: p.updatedAt });

                  return items.map((item, j) => (
                    <div key={`${p.userId}-${j}`} className="flex items-start gap-3 py-2 animate-fade-in">
                      <span className="text-base mt-0.5">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--foreground)]">{item.text}</p>
                        <p className="text-[10px] text-[var(--muted)]">
                          {(() => {
                            const diff = Date.now() - new Date(item.time).getTime();
                            const mins = Math.floor(diff / 60000);
                            if (mins < 60) return `${mins}m ago`;
                            const hrs = Math.floor(mins / 60);
                            if (hrs < 24) return `${hrs}h ago`;
                            return `${Math.floor(hrs / 24)}d ago`;
                          })()}
                        </p>
                      </div>
                    </div>
                  ));
                })
            )}
          </div>
        )}

        {/* Chat */}
        {activeTab === "chat" && (
          <>

        <div className="h-[400px] overflow-y-auto px-4 pb-2 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-[var(--muted)] text-center py-12">No messages yet. Start the conversation!</p>
          ) : (
            [...messages]
              .sort((a, b) => {
                const aPinned = a.pinnedAt ? 1 : 0;
                const bPinned = b.pinnedAt ? 1 : 0;
                if (aPinned !== bPinned) return bPinned - aPinned;
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              })
              .map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 p-2 -mx-2 rounded-lg transition-colors ${msg.pinnedAt ? "bg-[var(--accent)]/5 border-l-2 border-[var(--accent)]" : ""}`}
                >
                  {msg.authorAvatarUrl ? (
                    <img src={msg.authorAvatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs text-[var(--accent)] shrink-0 mt-0.5">
                      {msg.authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--foreground)]">{msg.authorName}</span>
                      <span className="text-[10px] text-[var(--muted)]">
                        {new Date(msg.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                      {msg.pinnedAt && (
                        <span className="text-[10px] text-[var(--accent)] font-medium">Pinned</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePinToggle(msg)}
                        className="ml-auto text-[var(--muted)] hover:text-[var(--accent)] p-1 -m-1 rounded transition-colors"
                        title={msg.pinnedAt ? "Unpin" : "Pin to top"}
                        aria-label={msg.pinnedAt ? "Unpin message" : "Pin message"}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill={msg.pinnedAt ? "currentColor" : "none"}
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-sm text-[var(--foreground)] mt-0.5 whitespace-pre-wrap break-words">{msg.text}</p>
                  </div>
                </div>
              ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t border-[var(--border)] p-3 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message…"
            className="input-base flex-1"
            maxLength={2000}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !newMessage.trim()}
            className="btn-primary btn-sm"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
