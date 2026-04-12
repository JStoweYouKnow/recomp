import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useAppStore } from "../store/appStore";
import { useAuthStore } from "../store/authStore";
import { apiJson } from "../lib/api";
import { setHasAdjustedPlan } from "../lib/storage";
import { syncToServer } from "../lib/sync";
import { Card, Button } from "../components/ui";
import { colors, fontSize, fontWeight, spacing } from "../theme";
import type { Macros } from "../lib/types";

export function AdjustScreen() {
  const { plan, meals, setPlan } = useAppStore();
  const { profile } = useAuthStore();
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    dietAdjustments?: { summary?: string; newTargets?: Macros };
    workoutAdjustments?: { summary?: string };
  } | null>(null);

  const handleAdjust = async () => {
    if (!plan) return;
    setLoading(true);
    setResult(null);
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentMeals = meals.filter((m) => new Date(m.date) >= weekAgo);
      const avgCal =
        recentMeals.length > 0
          ? recentMeals.reduce((s, m) => s + m.macros.calories, 0) / 7
          : null;
      const avgProt =
        recentMeals.length > 0
          ? recentMeals.reduce((s, m) => s + m.macros.protein, 0) / 7
          : null;

      const r = await apiJson<{
        dietAdjustments?: { summary?: string; newTargets?: Macros };
        workoutAdjustments?: { summary?: string };
        error?: string;
      }>("/api/plans/adjust", {
        method: "POST",
        body: JSON.stringify({
          plan,
          mealsThisWeek: recentMeals,
          feedback,
          avgDailyCalories: avgCal,
          avgDailyProtein: avgProt,
        }),
      });
      if (r.error) throw new Error(r.error);
      setResult(r);
    } catch (e) {
      console.error(e);
      Alert.alert("Adjustment failed", "Try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTargets = () => {
    const t = result?.dietAdjustments?.newTargets;
    if (!t || typeof t.calories !== "number") return;
    const updated = plan
      ? {
          ...plan,
          dietPlan: {
            ...plan.dietPlan,
            dailyTargets: t,
          },
        }
      : null;
    if (updated) {
      setPlan(updated);
      setHasAdjustedPlan();
      syncToServer();
      setResult(null);
      setFeedback("");
      Alert.alert("Done", "New calorie and macro targets applied.");
    }
  };

  const diet = result?.dietAdjustments;
  const workout = result?.workoutAdjustments;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Adjust your plan</Text>
      <Text style={styles.subtitle}>
        Analyze your progress and get dynamic adjustment suggestions. Powered by Nova Lite.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.label}>Feedback (how are you feeling? any changes?)</Text>
        <TextInput
          style={styles.textarea}
          value={feedback}
          onChangeText={setFeedback}
          placeholder="e.g. Feeling tired, want to increase protein, lost 4 lbs..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        <Button
          title={loading ? "Analyzing…" : "Get AI suggestions"}
          onPress={handleAdjust}
          loading={loading}
          disabled={!plan}
          style={styles.adjustBtn}
        />
      </Card>

      {result && (
        <Card style={styles.resultCard}>
          <Text style={styles.resultTitle}>Nova's suggestions</Text>
          {diet?.summary && (
            <Text style={styles.summary}>{diet.summary}</Text>
          )}
          {workout?.summary && (
            <Text style={styles.summary}>{workout.summary}</Text>
          )}
          {diet?.newTargets && (
            <Button
              title="Apply new calorie/macro targets"
              onPress={handleApplyTargets}
              variant="secondary"
              style={styles.applyBtn}
            />
          )}
        </Card>
      )}

      {!plan && (
        <Text style={styles.noPlan}>Complete onboarding to get a plan, then come back to adjust it.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing[5],
    paddingBottom: spacing[16],
  },
  title: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing[2],
  },
  subtitle: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginBottom: spacing[5],
  },
  card: {
    marginBottom: spacing[5],
  },
  label: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
    marginBottom: spacing[2],
  },
  textarea: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing[4],
    fontSize: fontSize.body,
    color: colors.foreground,
    minHeight: 100,
    marginBottom: spacing[4],
  },
  adjustBtn: {
    marginBottom: 0,
  },
  resultCard: {
    marginBottom: spacing[5],
  },
  resultTitle: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
    marginBottom: spacing[3],
  },
  summary: {
    fontSize: fontSize.body,
    color: colors.foreground,
    lineHeight: 22,
    marginBottom: spacing[3],
  },
  applyBtn: {
    marginTop: spacing[2],
  },
  noPlan: {
    fontSize: fontSize.small,
    color: colors.muted,
  },
});
