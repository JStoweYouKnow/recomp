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
  const [tab, setTab] = useState<"progress" | "members" | "messages">("progress");
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
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

  // Poll messages when on messages tab
  useEffect(() => {
    if (tab === "messages") {
      pollRef.current = setInterval(fetchMessages, 30_000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [tab, fetchMessages]);

  // Auto-scroll messages
  useEffect(() => {
    if (tab === "messages") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, tab]);

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

      {/* Header */}
      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">{group.name}</h2>
            {group.description && (
              <p className="text-sm text-[var(--muted)] mt-1">{group.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted)]">
              <span>{GOAL_LABELS[group.goalType] ?? group.goalType}</span>
              <span>{group.memberCount} member{group.memberCount !== 1 ? "s" : ""}</span>
              <span className="capitalize">{group.accessMode.replace("_", " ")}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLeave}
            className="text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)] transition"
          >
            Leave
          </button>
        </div>
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
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl bg-[var(--surface-elevated)]">
        {(["progress", "members", "messages"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition capitalize ${
              tab === t
                ? "bg-white text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Progress tab */}
      {tab === "progress" && (
        <div className="space-y-4">
          {/* Aggregate stats */}
          {(trackingMode === "aggregate" || trackingMode === "both") && aggregate && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Group Stats</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-[var(--accent)]">{aggregate.totalXp.toLocaleString()}</p>
                  <p className="text-xs text-[var(--muted)]">Total XP</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--accent)]">{aggregate.averageStreak}</p>
                  <p className="text-xs text-[var(--muted)]">Avg Streak</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--accent)]">{aggregate.averageMacroHitRate}%</p>
                  <p className="text-xs text-[var(--muted)]">Avg Macro Hit</p>
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {(trackingMode === "leaderboard" || trackingMode === "both") && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Leaderboard</h3>
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
            </div>
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === "members" && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
            Members ({members.length})
          </h3>
          <div className="space-y-2">
            {members.map((m, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-sm text-[var(--accent)]">
                  {m.groupName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--foreground)]">{m.groupName}</p>
                  <p className="text-xs text-[var(--muted)]">{m.role === "owner" ? "Owner" : "Member"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages tab */}
      {tab === "messages" && (
        <div className="card p-0 overflow-hidden">
          <div className="h-[400px] overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center py-8">No messages yet. Start the conversation!</p>
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
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
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
      )}
    </div>
  );
}
