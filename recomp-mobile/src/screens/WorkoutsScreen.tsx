import React, { useEffect } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppStore } from "../store/appStore";
import { CalendarView } from "../components/CalendarView";
import { Card, Button } from "../components/ui";
import { colors, fontSize, fontWeight, spacing, radius, lineHeight } from "../theme";

export function WorkoutsScreen() {
  const navigation = useNavigation();
  const { plan, selectedDate, setSelectedDate, hydrate } = useAppStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const matchWorkoutDay = (date: string): number | null => {
    if (!plan) return null;
    const d = new Date(date + "T12:00:00");
    const dow = d.getDay();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const shortNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = dayNames[dow].toLowerCase();
    const shortName = shortNames[dow].toLowerCase();
    for (let i = 0; i < plan.workoutPlan.weeklyPlan.length; i++) {
      const planDay = plan.workoutPlan.weeklyPlan[i].day.toLowerCase().trim();
      if (planDay === dayName || planDay === shortName || planDay.startsWith(dayName) || planDay.startsWith(shortName)) return i;
    }
    const mondayBased = dow === 0 ? 6 : dow - 1;
    return mondayBased < plan.workoutPlan.weeklyPlan.length ? mondayBased : null;
  };
  const idx = plan ? matchWorkoutDay(selectedDate) : null;
  const workoutDay = idx !== null && idx >= 0 ? plan!.workoutPlan.weeklyPlan[idx] : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Workouts</Text>
      <CalendarView selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {!workoutDay ? (
        <Card flat>
          <Text style={styles.empty}>Rest day</Text>
          <Text style={styles.emptySub}>No workout planned for this day.</Text>
        </Card>
      ) : (
        <Card>
          <Text style={styles.focus}>{workoutDay.focus}</Text>
          {workoutDay.exercises.map((ex, i) => (
            <View key={i} style={styles.exercise}>
              <Text style={styles.exName}>{ex.name}</Text>
              <Text style={styles.exSets}>
                {ex.sets}×{ex.reps}
                {ex.notes ? ` · ${ex.notes}` : ""}
              </Text>
            </View>
          ))}
          <Button
            title="Adjust plan"
            variant="secondary"
            onPress={() => navigation.navigate("More", { screen: "Adjust" })}
            style={styles.adjustBtn}
          />
        </Card>
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
    marginBottom: spacing[4],
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
  focus: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing[4],
  },
  exercise: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    marginBottom: spacing[2],
  },
  exName: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.foreground,
  },
  exSets: {
    fontSize: fontSize.small,
    color: colors.muted,
    lineHeight: lineHeight.small,
    marginTop: spacing[1],
  },
  adjustBtn: {
    marginTop: spacing[4],
  },
});
