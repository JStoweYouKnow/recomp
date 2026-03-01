"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/Toast";
import { getMyGroups, saveMyGroups } from "@/lib/storage";
import type { GroupMembership, Group } from "@/lib/types";

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

export function GroupsView({
  onSelectGroup,
  onCreateGroup,
}: {
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: () => void;
}) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"mine" | "discover">("mine");
  const [myGroups, setMyGroups] = useState<GroupMembership[]>(() => getMyGroups());
  const [openGroups, setOpenGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

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

  useEffect(() => {
    if (tab === "discover") fetchOpenGroups();
  }, [tab, fetchOpenGroups]);

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
        {(["mine", "discover"] as const).map((t) => (
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
            {t === "mine" ? "My Groups" : "Discover"}
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
    </div>
  );
}
