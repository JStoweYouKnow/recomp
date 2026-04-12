import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from "react-native";
import { Video, ResizeMode } from "expo-av";
import { useAppStore } from "../store/appStore";
import { useAuthStore } from "../store/authStore";
import { getWearableData } from "../lib/storage";
import { getHasAdjustedPlan } from "../lib/storage";
import { computeMilestones, BADGE_INFO, getBadgeIcon } from "../lib/milestones";
import { apiFetch } from "../lib/api";
import { Card, Button } from "../components/ui";
import { colors, fontSize, fontWeight, spacing, radius, lineHeight } from "../theme";

const GOAL_LABELS: Record<string, string> = {
  lose_weight: "fat loss",
  build_muscle: "building muscle",
  improve_endurance: "improving endurance",
  maintain: "maintaining fitness",
};

export function MilestonesScreen() {
  const { plan, meals, hydrate } = useAppStore();
  const { profile } = useAuthStore();
  const [wearableCount, setWearableCount] = useState(0);
  const [hasAdjusted, setHasAdjusted] = useState(false);
  const [reelProcessing, setReelProcessing] = useState(false);
  const [reelMessage, setReelMessage] = useState<string | null>(null);
  const [reelVideoUrl, setReelVideoUrl] = useState<string | null>(null);
  const [reelIsDemo, setReelIsDemo] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hydrate();
    getWearableData().then((d) => setWearableCount(d.length));
    getHasAdjustedPlan().then(setHasAdjusted);
  }, [hydrate]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (timeoutTimer.current) clearTimeout(timeoutTimer.current);
    };
  }, []);

  const targets = plan?.dietPlan?.dailyTargets ?? {
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 65,
  };
  const { milestones, xp, progress } = computeMilestones(
    meals,
    plan,
    targets,
    wearableCount,
    hasAdjusted
  );
  const earnedIds = new Set(milestones.map((m) => m.id));
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const xpForNext = level * level * 100 - xp;
  const xpInLevel = xp - (level - 1) * (level - 1) * 100;
  const xpNeededForLevel = level * level * 100 - (level - 1) * (level - 1) * 100;
  const levelProgress = Math.min(100, (xpInLevel / xpNeededForLevel) * 100);

  const allBadges = Object.entries(BADGE_INFO);

  const handleGenerateRecap = useCallback(async () => {
    try {
      setReelVideoUrl(null);
      setReelIsDemo(false);
      const mealDates = new Set(meals.map((m) => m.date));
      const sortedDates = [...mealDates].sort();
      const firstDate = sortedDates[0];
      const lastDate = sortedDates[sortedDates.length - 1];
      const daysActive =
        firstDate && lastDate
          ? Math.max(1, Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / 86400000) + 1)
          : 1;
      const weeksActive = Math.max(1, Math.ceil(daysActive / 7));
      const recapData = {
        name: profile?.name ?? "User",
        goal: GOAL_LABELS[profile?.goal ?? "maintain"] ?? "fitness",
        daysActive,
        weeksActive,
        totalMealsLogged: meals.length,
        currentStreak: 0, // streak computed from milestones progress
        badgesEarned: milestones.length,
        level,
        xp,
      };
      // Use the longest streak from progress as currentStreak
      const streakKeys = Object.keys(progress).filter((k) => k.startsWith("streak_"));
      if (streakKeys.length > 0) {
        recapData.currentStreak = Math.max(...streakKeys.map((k) => progress[k] ?? 0));
      }

      const res = await apiFetch("/api/body-scan/progress-reel", {
        method: "POST",
        body: JSON.stringify(recapData),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.videoUrl && data.status === "completed") {
        setReelVideoUrl(data.videoUrl);
        setReelProcessing(false);
        setReelMessage(null);
        setReelIsDemo(Boolean(data.isDemo));
        return;
      }

      if (data.jobId) {
        setReelMessage(data.message ?? "Generating your journey recap video.");
        setReelProcessing(true);
        const poll = async () => {
          try {
            const pollRes = await apiFetch(`/api/body-scan/progress-reel?jobId=${encodeURIComponent(data.jobId)}`);
            const pollData = await pollRes.json();
            if (pollData.error) return;
            if (pollData.status === "Completed" && pollData.videoUrl) {
              setReelVideoUrl(pollData.videoUrl);
              setReelProcessing(false);
              setReelMessage(null);
              setReelIsDemo(false);
              return;
            }
            if (pollData.status === "Failed") {
              setReelProcessing(false);
              setReelMessage(null);
              Alert.alert("Error", pollData.failureMessage ?? "Video generation failed");
              return;
            }
            pollTimer.current = setTimeout(poll, 5000);
          } catch {
            setReelProcessing(false);
            setReelMessage(null);
          }
        };
        pollTimer.current = setTimeout(poll, 5000);
        timeoutTimer.current = setTimeout(() => {
          setReelProcessing(false);
          setReelMessage(null);
        }, 120_000);
      }
    } catch (err) {
      setReelProcessing(false);
      Alert.alert("Error", "Failed to start journey recap");
    }
  }, [meals, milestones, profile, xp, level, progress]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your Progress</Text>

      <Card style={styles.levelCard}>
        <View style={styles.levelRow}>
          <View style={styles.levelCircle}>
            <Text style={styles.levelNum}>{level}</Text>
          </View>
          <View style={styles.levelInfo}>
            <Text style={styles.levelLabel}>Level</Text>
            <Text style={styles.levelVal}>{level}</Text>
          </View>
          <View style={styles.xpBar}>
            <View style={styles.xpBarTrack}>
              <View
                style={[styles.xpBarFill, { width: `${levelProgress}%` }]}
              />
            </View>
            <View style={styles.xpMeta}>
              <Text style={styles.xpMetaText}>{xp} XP</Text>
              <Text style={styles.xpMetaText}>{xpForNext} XP to next</Text>
            </View>
          </View>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Badges</Text>
      <View style={styles.badgeGrid}>
        {allBadges.map(([id, info]) => {
          const earned = earnedIds.has(id);
          const displayProgress =
            id.startsWith("meal_streak")
              ? progress[`streak_${id.replace("meal_streak_", "")}`]
              : id === "macro_hit_week"
                ? progress.macro_week
                : id === "week_warrior"
                  ? progress.week_warrior
                  : null;

          return (
            <View
              key={id}
              style={[
                styles.badgeCard,
                earned ? styles.badgeCardEarned : styles.badgeCardLocked,
              ]}
            >
              <Text style={styles.badgeIcon}>{getBadgeIcon(id)}</Text>
              <Text style={styles.badgeName}>{info.name}</Text>
              <Text style={styles.badgeDesc}>{info.desc}</Text>
              {!earned && displayProgress != null && displayProgress > 0 && (
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${displayProgress}%` },
                    ]}
                  />
                </View>
              )}
              {earned && (
                <Text style={styles.badgeXp}>+{info.xp} XP</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Journey Recap */}
      {meals.length >= 5 && (
        <Card style={styles.recapCard}>
          <Text style={styles.sectionTitle}>Journey Recap</Text>
          <Text style={styles.recapDesc}>
            Generate a personalized video recap of your fitness journey powered by Nova Reel.
          </Text>
          <Button
            title={reelProcessing ? "Processing\u2026" : "Generate journey recap"}
            onPress={handleGenerateRecap}
            disabled={reelProcessing}
            variant="secondary"
            style={styles.recapButton}
          />
          {reelProcessing && reelMessage && (
            <View style={styles.recapStatus}>
              <ActivityIndicator size="small" color={colors.accent} style={{ marginBottom: spacing[2] }} />
              <Text style={styles.recapStatusTitle}>Video generation in progress</Text>
              <Text style={styles.recapStatusMsg}>{reelMessage}</Text>
              <Text style={styles.recapStatusHint}>Nova Reel may take a few minutes. Check back later.</Text>
            </View>
          )}
          {reelVideoUrl && (
            <View style={styles.recapVideoContainer}>
              <View style={styles.recapVideoHeader}>
                <Text style={styles.recapVideoLabel}>Your journey recap</Text>
                {reelIsDemo && (
                  <View style={styles.demoBadge}>
                    <Text style={styles.demoBadgeText}>Demo</Text>
                  </View>
                )}
              </View>
              <Video
                source={{ uri: reelVideoUrl }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                style={styles.recapVideo}
              />
              <TouchableOpacity onPress={() => { setReelVideoUrl(null); setReelIsDemo(false); }}>
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing[5], paddingBottom: spacing[16] },
  title: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing[4],
  },
  levelCard: { marginBottom: spacing[6] },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing[4],
  },
  levelCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent10,
    alignItems: "center",
    justifyContent: "center",
  },
  levelNum: {
    fontSize: fontSize.h3,
    fontWeight: fontWeight.bold,
    color: colors.accent,
  },
  levelInfo: {},
  levelLabel: { fontSize: fontSize.small, color: colors.muted },
  levelVal: { fontSize: fontSize.h4, fontWeight: fontWeight.bold, color: colors.foreground },
  xpBar: { flex: 1, minWidth: 150 },
  xpBarTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.borderSoft,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  xpMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing[1],
  },
  xpMetaText: {
    fontSize: fontSize.caption,
    color: colors.muted,
  },
  sectionTitle: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing[4],
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[4],
  },
  badgeCard: {
    flexBasis: "46%",
    flexGrow: 1,
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
  },
  badgeCardEarned: {
    backgroundColor: colors.accent10,
    borderColor: colors.accent + "80",
  },
  badgeCardLocked: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    opacity: 0.9,
  },
  badgeIcon: { fontSize: 32, marginBottom: spacing[2], textAlign: "center" },
  badgeName: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    textAlign: "center",
  },
  badgeDesc: {
    fontSize: fontSize.caption,
    color: colors.muted,
    lineHeight: lineHeight.caption,
    marginTop: spacing[1],
    textAlign: "center",
  },
  progressBar: {
    marginTop: spacing[2],
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.accent + "80",
  },
  badgeXp: {
    fontSize: fontSize.caption,
    color: colors.accent,
    marginTop: spacing[2],
    textAlign: "center",
  },
  recapCard: { marginTop: spacing[6] },
  recapDesc: {
    fontSize: fontSize.caption,
    color: colors.muted,
    marginTop: spacing[2],
  },
  recapButton: { marginTop: spacing[3] },
  recapStatus: {
    marginTop: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent + "4D",
    backgroundColor: colors.accent + "0D",
    padding: spacing[3],
  },
  recapStatusTitle: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  recapStatusMsg: {
    fontSize: fontSize.caption,
    color: colors.muted,
    marginTop: spacing[1],
  },
  recapStatusHint: {
    fontSize: 10,
    color: colors.muted,
    marginTop: spacing[2],
  },
  recapVideoContainer: {
    marginTop: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent + "4D",
    backgroundColor: colors.surfaceElevated,
    padding: spacing[3],
  },
  recapVideoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[2],
  },
  recapVideoLabel: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  demoBadge: {
    backgroundColor: colors.muted + "33",
    borderRadius: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  demoBadgeText: {
    fontSize: 10,
    color: colors.muted,
  },
  recapVideo: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
  },
  dismissText: {
    fontSize: fontSize.caption,
    color: colors.muted,
    marginTop: spacing[2],
  },
});
