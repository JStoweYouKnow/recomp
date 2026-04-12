import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useAppStore } from "../store/appStore";
import { CalendarView } from "../components/CalendarView";
import { LogMealSheet } from "../components/LogMealSheet";
import { Card, Button } from "../components/ui";
import { colors, fontSize, fontWeight, spacing, lineHeight, radius } from "../theme";
import { syncToServer } from "../lib/sync";

const mealTypeColor = (type: string) => {
  switch (type) {
    case "breakfast": return colors.accentWarm;
    case "lunch": return colors.accent;
    case "dinner": return colors.accentSage;
    default: return colors.muted;
  }
};

export function MealsScreen() {
  const { meals, selectedDate, setSelectedDate, hydrate, plan } = useAppStore();
  const [logSheetOpen, setLogSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const filteredMeals = meals.filter((m) => m.date === selectedDate);

  const onRefresh = async () => {
    setRefreshing(true);
    await hydrate();
    await syncToServer();
    setRefreshing(false);
  };
  const targets = plan?.dietPlan?.dailyTargets ?? { calories: 2000, protein: 150, carbs: 200, fat: 65 };

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Meals</Text>
        <Button title="Log meal" onPress={() => setLogSheetOpen(true)} style={styles.logBtn} />
      </View>
      <CalendarView selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      {filteredMeals.length === 0 ? (
        <Card flat>
          <Text style={styles.empty}>No meals logged for this day.</Text>
          <Text style={styles.emptySub}>
            Tap "Log meal" to add meals via text, photo, or receipt scan.
          </Text>
        </Card>
      ) : (
        filteredMeals.map((m) => (
          <Card key={m.id} style={[styles.mealCard, { borderLeftWidth: 3, borderLeftColor: mealTypeColor(m.mealType) }]}>
            <Text style={styles.mealName}>{m.name}</Text>
            <Text style={styles.mealMeta}>
              {m.mealType.charAt(0).toUpperCase() + m.mealType.slice(1)} · {m.macros.calories} cal
            </Text>
            <Text style={styles.mealMacros}>
              P: {m.macros.protein}g · C: {m.macros.carbs}g · F: {m.macros.fat}g
            </Text>
          </Card>
        ))
      )}
      <LogMealSheet
        visible={logSheetOpen}
        onClose={() => setLogSheetOpen(false)}
        selectedDate={selectedDate}
        targets={targets}
      />
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
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[4],
  },
  title: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  logBtn: {
    minWidth: 100,
  },
  empty: {
    fontSize: fontSize.body,
    color: colors.muted,
  },
  emptySub: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginTop: spacing[2],
  },
  mealCard: {
    marginBottom: spacing[4],
  },
  mealName: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  mealMeta: {
    fontSize: fontSize.small,
    color: colors.muted,
    lineHeight: lineHeight.small,
    marginTop: spacing[1],
  },
  mealMacros: {
    fontSize: fontSize.caption,
    color: colors.muted,
    lineHeight: lineHeight.caption,
    marginTop: spacing[1],
  },
});
