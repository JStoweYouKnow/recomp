import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Card } from "./ui";
import { colors, fontSize, fontWeight, spacing, radius, lineHeight } from "../theme";
import type { FitnessPlan, MealEntry, Macros } from "../lib/types";

function pct(n: number, t: number) {
  return t > 0 ? Math.min(100, Math.round((n / t) * 100)) : 0;
}

interface TodayAtAGlanceProps {
  plan: FitnessPlan | null;
  meals: MealEntry[];
  todaysTotals: Macros;
  targets: Macros;
  baseBudget: number;
  adjustedBudget: number;
  todayAdjustment: number;
  today: string;
  onNavigateToMeals: () => void;
  onNavigateToWorkouts: () => void;
}

export function TodayAtAGlance({
  plan,
  meals,
  todaysTotals,
  targets,
  baseBudget,
  adjustedBudget,
  todayAdjustment,
  today,
  onNavigateToMeals,
  onNavigateToWorkouts,
}: TodayAtAGlanceProps) {
  const [workoutExpanded, setWorkoutExpanded] = useState(false);
  const [dietExpanded, setDietExpanded] = useState(false);

  const matchWorkout = (date: string): number | null => {
    if (!plan) return null;
    const d = new Date(date + "T12:00:00");
    const dow = d.getDay();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const shortNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = dayNames[dow].toLowerCase();
    const shortName = shortNames[dow].toLowerCase();
    for (let i = 0; i < plan.workoutPlan.weeklyPlan.length; i++) {
      const p = plan.workoutPlan.weeklyPlan[i].day.toLowerCase().trim();
      if (p === dayName || p === shortName || p.startsWith(dayName) || p.startsWith(shortName)) return i;
    }
    const mb = dow === 0 ? 6 : dow - 1;
    return mb < plan.workoutPlan.weeklyPlan.length ? mb : null;
  };
  const matchDiet = (date: string): number | null => {
    if (!plan) return null;
    const d = new Date(date + "T12:00:00");
    const dow = d.getDay();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const shortNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = dayNames[dow].toLowerCase();
    const shortName = shortNames[dow].toLowerCase();
    for (let i = 0; i < plan.dietPlan.weeklyPlan.length; i++) {
      const p = plan.dietPlan.weeklyPlan[i].day.toLowerCase().trim();
      if (p === dayName || p === shortName || p.startsWith(dayName) || p.startsWith(shortName)) return i;
    }
    const mb = dow === 0 ? 6 : dow - 1;
    return mb < plan.dietPlan.weeklyPlan.length ? mb : null;
  };
  const idx = plan ? matchWorkout(today) : null;
  const workoutDay = idx !== null ? plan!.workoutPlan.weeklyPlan[idx] : null;
  const dietIdx = plan ? matchDiet(today) : null;
  const dietDay = dietIdx !== null ? plan!.dietPlan.weeklyPlan[dietIdx] : null;
  const loggedMeals = meals.filter((m) => m.date === today);

  return (
    <Card>
      <Text style={styles.title}>Today at a glance</Text>

      <View style={styles.budgetSection}>
        <View style={styles.budgetHeader}>
          <Text style={styles.calorieNum}>{todaysTotals.calories}</Text>
          <Text style={styles.budgetLabel}>
            of <Text style={styles.budgetVal}>{adjustedBudget}</Text> cal
            {todayAdjustment !== 0 && (
              <Text style={styles.adjustment}>
                {" "}({baseBudget} base {todayAdjustment > 0 ? "+" : ""}{todayAdjustment})
              </Text>
            )}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${pct(todaysTotals.calories, adjustedBudget)}%` },
            ]}
          />
        </View>
        <Text style={styles.remaining}>
          {Math.max(0, adjustedBudget - todaysTotals.calories)} cal remaining
        </Text>
      </View>

      <View style={styles.macrosGrid}>
        {(["calories", "protein", "carbs", "fat"] as const).map((key) => (
          <View key={key} style={styles.macroCard}>
            <Text style={styles.macroLabel}>{key}</Text>
            <Text style={styles.macroVal}>
              {key === "calories" ? todaysTotals.calories : `${todaysTotals[key]}g`}
              <Text style={styles.macroTarget}>
                {" "}/ {key === "calories" ? targets.calories : `${targets[key]}g`}
              </Text>
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${pct(todaysTotals[key], targets[key])}%` },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.miniCards}>
        <TouchableOpacity
          style={styles.miniCard}
          onPress={() => setWorkoutExpanded(!workoutExpanded)}
          activeOpacity={0.8}
        >
          <View style={styles.miniCardHeader}>
            <Text style={styles.miniCardTitle}>Today's workout</Text>
          </View>
          {!workoutDay ? (
            <Text style={styles.miniCardSub}>Rest day</Text>
          ) : (
            <Text style={styles.miniCardSub}>
              {workoutDay.focus} · {workoutDay.exercises.length} exercises
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.miniCard}
          onPress={() => setDietExpanded(!dietExpanded)}
          activeOpacity={0.8}
        >
          <View style={styles.miniCardHeader}>
            <Text style={styles.miniCardTitle}>Today's diet</Text>
          </View>
          <Text style={styles.miniCardSub}>
            {loggedMeals.length} meal{loggedMeals.length !== 1 ? "s" : ""} logged
            {dietDay ? ` · plan ${dietDay.meals.reduce((s, m) => s + (m.macros?.calories ?? 0), 0)} cal` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onNavigateToMeals} activeOpacity={0.8}>
          <Text style={styles.actionBtnText}>Log meal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onNavigateToWorkouts} activeOpacity={0.8}>
          <Text style={styles.actionBtnText}>View workout</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing[4],
  },
  budgetSection: {
    marginBottom: spacing[4],
  },
  budgetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing[1],
  },
  calorieNum: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.bold,
    color: colors.foreground,
  },
  budgetLabel: {
    fontSize: fontSize.small,
    color: colors.muted,
    lineHeight: lineHeight.small,
  },
  budgetVal: {
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  adjustment: {
    fontSize: fontSize.caption,
    color: colors.muted,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.borderSoft,
    overflow: "hidden",
    marginTop: spacing[2],
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  remaining: {
    fontSize: fontSize.caption,
    color: colors.muted,
    lineHeight: lineHeight.caption,
    marginTop: spacing[1],
  },
  macrosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  macroCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing[2],
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.muted,
  },
  macroVal: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
    color: colors.foreground,
  },
  macroTarget: {
    fontSize: 10,
    fontWeight: fontWeight.normal,
    color: colors.muted,
  },
  miniCards: {
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  miniCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    padding: spacing[3],
  },
  miniCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing[1],
  },
  miniCardTitle: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  miniCardSub: {
    fontSize: 10,
    color: colors.muted,
  },
  actions: {
    flexDirection: "row",
    gap: spacing[3],
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  actionBtnText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
  },
});
