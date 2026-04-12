import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { apiJson } from "../lib/api";
import { getWeeklyReview, saveWeeklyReview } from "../lib/storage";
import { Card, Button } from "../components/ui";
import { colors, fontSize, fontWeight, spacing, lineHeight } from "../theme";
import type { WeeklyReview } from "../lib/types";
import type { WearableDaySummary } from "../lib/types";

interface WeeklyReviewCardProps {
  plan: { dietPlan?: { dailyTargets?: { calories: number; protein: number; carbs: number; fat: number } } } | null;
  meals: { date: string; macros: { calories: number; protein: number } }[];
  profile: { goal: string; name: string } | null;
  wearableData: WearableDaySummary[];
  onDataFetched?: () => void;
}

export function WeeklyReviewCard({
  plan,
  meals,
  profile,
  wearableData,
}: WeeklyReviewCardProps) {
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getWeeklyReview().then(setWeeklyReview);
  }, []);

  const handleGenerate = async () => {
    if (!profile || !plan?.dietPlan?.dailyTargets) return;
    setLoading(true);
    try {
      const data = await apiJson<WeeklyReview | { error: string }>(
        "/api/agent/weekly-review",
        {
          method: "POST",
          body: JSON.stringify({
            meals,
            targets: plan.dietPlan.dailyTargets,
            wearableData: wearableData ?? [],
            goal: profile.goal,
            userName: profile.name,
          }),
        }
      );
      if (data && !("error" in data)) {
        setWeeklyReview(data);
        await saveWeeklyReview(data);
      } else throw new Error((data as { error: string }).error);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card flat style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Weekly AI Review</Text>
          <Text style={styles.subtitle}>
            Autonomous agent analyzes meals, wearables & research
          </Text>
          <Text style={styles.badgeLabel}>Powered by Amazon Nova multi-agent</Text>
        </View>
        <Button
          title={loading ? "Analyzing…" : "Generate"}
          onPress={handleGenerate}
          loading={loading}
          disabled={!plan || !profile}
          style={styles.generateBtn}
        />
      </View>
      {loading && (
        <Text style={styles.loadingText}>
          Agent running: analyzing meals, checking wearables…
        </Text>
      )}
      {weeklyReview && !loading && (
        <View style={styles.result}>
          <Text style={styles.summary}>{weeklyReview.summary}</Text>
          {weeklyReview.agentSteps && weeklyReview.agentSteps.length > 0 && (
            <View style={styles.badges}>
              {weeklyReview.agentSteps.map((step, i) => (
                <View key={i} style={styles.badge}>
                  <Text style={styles.badgeText}>{step.tool}</Text>
                </View>
              ))}
            </View>
          )}
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={styles.expandBtn}>
              {expanded ? "Show less" : "Show full review"}
            </Text>
          </TouchableOpacity>
          {expanded && (
            <View style={styles.expanded}>
              {weeklyReview.mealAnalysis ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Meal Analysis</Text>
                  <Text style={styles.sectionText}>{weeklyReview.mealAnalysis}</Text>
                </View>
              ) : null}
              {weeklyReview.wearableInsights ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Wearable Insights</Text>
                  <Text style={styles.sectionText}>{weeklyReview.wearableInsights}</Text>
                </View>
              ) : null}
              {weeklyReview.recommendations?.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Recommendations</Text>
                  {weeklyReview.recommendations.map((r, i) => (
                    <Text key={i} style={styles.recItem}>• {r}</Text>
                  ))}
                </View>
              ) : null}
              <Text style={styles.meta}>
                Generated {new Date(weeklyReview.createdAt).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing[4] },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing[4],
    marginBottom: spacing[2],
  },
  title: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  subtitle: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginTop: spacing[1],
  },
  badgeLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.muted,
    marginTop: spacing[1],
  },
  generateBtn: { flexShrink: 0 },
  loadingText: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginTop: spacing[2],
  },
  result: { marginTop: spacing[2] },
  summary: {
    fontSize: fontSize.body,
    color: colors.foreground,
    lineHeight: lineHeight.body,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginTop: spacing[3],
  },
  badge: {
    backgroundColor: colors.accent10,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: 8,
  },
  badgeText: {
    fontSize: fontSize.caption,
    color: colors.accent,
    fontWeight: fontWeight.medium,
  },
  expandBtn: {
    fontSize: fontSize.small,
    color: colors.accent,
    marginTop: spacing[3],
  },
  expanded: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: spacing[4],
    marginTop: spacing[2],
  },
  section: { marginBottom: spacing[4] },
  sectionLabel: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing[1],
  },
  sectionText: {
    fontSize: fontSize.body,
    color: colors.foreground,
    lineHeight: lineHeight.body,
  },
  recItem: {
    fontSize: fontSize.body,
    color: colors.foreground,
    lineHeight: lineHeight.body,
    marginBottom: spacing[1],
  },
  meta: {
    fontSize: fontSize.caption,
    color: colors.muted,
    marginTop: spacing[2],
  },
});
