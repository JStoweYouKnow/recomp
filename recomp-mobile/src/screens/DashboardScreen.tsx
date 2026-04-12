import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuthStore } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import { TodayAtAGlance } from "../components/TodayAtAGlance";
import { CalendarView } from "../components/CalendarView";
import { WeeklyReviewCard } from "../components/WeeklyReviewCard";

import { ShoppingListCard } from "../components/ShoppingListCard";
import { DashboardSkeleton } from "../components/Skeleton";
import { Card, Button } from "../components/ui";
import { colors, fontSize, fontWeight, spacing } from "../theme";
import { syncToServer } from "../lib/sync";
import { apiJson } from "../lib/api";
import { getWearableData } from "../lib/storage";
import type { FitnessPlan, WearableDaySummary } from "../lib/types";

export function DashboardScreen() {
  const navigation = useNavigation();
  const { profile, setProfile, isDemoMode, checkAuth } = useAuthStore();
  const {
    plan,
    meals,
    selectedDate,
    setSelectedDate,
    hydrate,
    activityLog,
    setPlan,
  } = useAppStore();

  const [refreshing, setRefreshing] = React.useState(false);
  const [planRegenerating, setPlanRegenerating] = React.useState(false);
  const [wearableData, setWearableData] = useState<WearableDaySummary[]>([]);
  const [isLoading, setIsLoading] = useState(!plan);

  useEffect(() => {
    Promise.all([
      getWearableData().then(setWearableData),
      hydrate(),
    ]).finally(() => setIsLoading(false));
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const todaysMeals = meals.filter((m) => m.date === today);
  const todaysTotals = todaysMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.macros.calories,
      protein: acc.protein + m.macros.protein,
      carbs: acc.carbs + m.macros.carbs,
      fat: acc.fat + m.macros.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const targets = plan?.dietPlan?.dailyTargets ?? {
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 65,
  };
  const todayActivities = activityLog.filter((a) => a.date === today);
  const todayAdjustment = todayActivities.reduce((s, a) => s + a.calorieAdjustment, 0);
  const baseBudget = targets.calories;
  const adjustedBudget = baseBudget + todayAdjustment;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (profile) checkAuth();
  }, [profile, checkAuth]);

  const onRefresh = async () => {
    setRefreshing(true);
    await hydrate();
    getWearableData().then(setWearableData);
    await syncToServer();
    setRefreshing(false);
  };

  const handleRegeneratePlan = () => {
    if (!profile) return;
    Alert.alert(
      "Regenerate plan",
      "This will create a new diet and workout plan based on your current profile. Your meal logs will be kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          onPress: async () => {
            setPlanRegenerating(true);
            try {
              const p = await apiJson<FitnessPlan | { error: string }>(
                "/api/plans/generate",
                { method: "POST", body: JSON.stringify(profile) }
              );
              if (p && !("error" in p)) {
                await setPlan(p);
                await syncToServer();
              } else throw new Error((p as { error: string }).error);
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "Plan generation failed. Try again.");
            } finally {
              setPlanRegenerating(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <ScrollView style={styles.container}>
        <DashboardSkeleton />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {isDemoMode && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerText}>
            Demo mode — Data stored locally. Complete onboarding to sync.
          </Text>
        </View>
      )}
      <TodayAtAGlance
        plan={plan}
        meals={meals}
        todaysTotals={todaysTotals}
        targets={targets}
        baseBudget={baseBudget}
        adjustedBudget={adjustedBudget}
        todayAdjustment={todayAdjustment}
        today={today}
        onNavigateToMeals={() => navigation.navigate("Meals")}
        onNavigateToWorkouts={() => navigation.navigate("Workouts")}
      />

      <CalendarView
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      <Card flat style={styles.planCard}>
        <Text style={styles.sectionTitle}>Regenerate plan</Text>
        <Text style={styles.sectionSub}>
          Get a fresh diet and workout plan based on your profile.
        </Text>
        <Button
          title={planRegenerating ? "Creating…" : "Regenerate my plan"}
          onPress={handleRegeneratePlan}
          loading={planRegenerating}
          disabled={!profile}
          variant="secondary"
          style={styles.regenerateBtn}
        />
      </Card>

      <WeeklyReviewCard
        plan={plan}
        meals={meals}
        profile={profile}
        wearableData={wearableData}
      />

      <Modal visible={planRegenerating} transparent>
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingTitle}>Creating your plan</Text>
            <Text style={styles.loadingSub}>
              Amazon Nova is generating your personalized diet and workout plan…
            </Text>
          </View>
        </View>
      </Modal>
      <View style={styles.shoppingCard}>
        <ShoppingListCard plan={plan} />
      </View>
      <Card flat>
        <Text style={styles.sectionTitle}>Wearables</Text>
        <Text style={styles.sectionSub}>
          Connect Oura, Fitbit, or import data. Go to More → Wearables.
        </Text>
      </Card>
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
  sectionTitle: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  sectionSub: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginTop: spacing[2],
  },
  demoBanner: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 8,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  demoBannerText: {
    fontSize: fontSize.small,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  planCard: { marginBottom: spacing[4] },
  shoppingCard: { marginBottom: spacing[4] },
  regenerateBtn: { marginTop: spacing[3] },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing[5],
  },
  loadingCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing[8],
    alignItems: "center",
    maxWidth: 320,
  },
  loadingTitle: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: spacing[4],
  },
  loadingSub: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginTop: spacing[2],
    textAlign: "center",
  },
});
