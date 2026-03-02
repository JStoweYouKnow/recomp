"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/components/Toast";
import { saveCachedGroup, saveCachedGroupMessages, getCachedGroupMessages } from "@/lib/storage";
import type { Group, GroupMembership, GroupMessage, GroupMemberProgress, GroupTrackingMode } from "@/lib/types";

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
    Promise.all([fetchGroup(), fetchMessages(), fetchProgress()]).finally(() => setLoading(false));
  }, [fetchGroup, fetchMessages, fetchProgress]);

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
                  {progress.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">No progress data yet. Members need to sync their data.</p>
                  ) : (
                    <div className="space-y-2">
                      {progress.map((p, i) => (
                        <div key={p.userId} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-elevated)]">
                          <span className={`w-6 text-center font-bold text-sm ${
                            i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-700" : "text-[var(--muted)]"
                          }`}>
                            {i + 1}
                          </span>
                          {p.avatarDataUrl ? (
                            <img src={p.avatarDataUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-sm text-[var(--accent)]">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--foreground)] truncate">{p.name}</p>
                            <p className="text-xs text-[var(--muted)]">Level {xpToLevel(p.xp)} · {p.xp} XP</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-[var(--accent)]">{p.streakLength}d</p>
                            <p className="text-xs text-[var(--muted)]">{p.macroHitRate}% macros</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Message board (always visible) ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Message Board</h3>
        </div>
        <div className="h-[400px] overflow-y-auto px-4 pb-2 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-[var(--muted)] text-center py-12">No messages yet. Start the conversation!</p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="flex gap-2">
                {msg.authorAvatarUrl ? (
                  <img src={msg.authorAvatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs text-[var(--accent)] shrink-0 mt-0.5">
                    {msg.authorName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">{msg.authorName}</span>
                    <span className="text-[10px] text-[var(--muted)]">
                      {new Date(msg.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
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
            className="btn-primary !py-2 !px-4"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
