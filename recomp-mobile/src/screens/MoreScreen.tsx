import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppStore } from "../store/appStore";
import { useAuthStore } from "../store/authStore";
import { Card } from "../components/ui";
import { WeeklyReviewCard } from "../components/WeeklyReviewCard";
import { RicoChatModal } from "../components/RicoChatModal";
import { getWearableData } from "../lib/storage";
import { colors, fontSize, fontWeight, spacing } from "../theme";
import type { WearableDaySummary } from "../lib/types";

export function MoreScreen() {
  const navigation = useNavigation();
  const { plan, meals } = useAppStore();
  const { profile } = useAuthStore();
  const [ricoOpen, setRicoOpen] = useState(false);
  const [wearableData, setWearableData] = useState<WearableDaySummary[]>([]);

  React.useEffect(() => {
    getWearableData().then(setWearableData);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>More</Text>

      {/* AI Features — prominent placement */}
      <TouchableOpacity
        onPress={() => setRicoOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Open Reco AI fitness coach"
      >
        <Card style={styles.aiItem}>
          <View style={styles.aiRow}>
            <View style={styles.aiIcon}>
              <Text style={styles.aiIconText}>AI</Text>
            </View>
            <View style={styles.aiContent}>
              <Text style={styles.aiLabel}>Reco AI Coach</Text>
              <Text style={styles.menuSub}>Chat or voice — ask about diet, workouts, motivation</Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>

      <WeeklyReviewCard
        plan={plan}
        meals={meals}
        profile={profile}
        wearableData={wearableData}
      />

      <TouchableOpacity
        onPress={() => navigation.navigate("Profile")}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Card style={styles.menuItem}>
          <View style={styles.menuRow}>
            <View style={styles.menuContent}>
              <Text style={styles.menuLabel}>Profile</Text>
              <Text style={styles.menuSub}>View and edit your profile</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Card>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate("Adjust")}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Card style={styles.menuItem}>
          <View style={styles.menuRow}>
            <View style={styles.menuContent}>
              <Text style={styles.menuLabel}>Adjust plan</Text>
              <Text style={styles.menuSub}>Get AI suggestions to refine your plan</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Card>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate("Wearables")}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Card style={styles.menuItem}>
          <View style={styles.menuRow}>
            <View style={styles.menuContent}>
              <Text style={styles.menuLabel}>Wearables</Text>
              <Text style={styles.menuSub}>Connect Oura, Fitbit, or import data</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Card>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate("Milestones")}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Card style={styles.menuItem}>
          <View style={styles.menuRow}>
            <View style={styles.menuContent}>
              <Text style={styles.menuLabel}>Progress</Text>
              <Text style={styles.menuSub}>Badges, XP, and milestones</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Card>
      </TouchableOpacity>

      <RicoChatModal visible={ricoOpen} onClose={() => setRicoOpen(false)} />
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
  menuItem: {
    marginBottom: spacing[4],
  },
  menuLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.foreground,
  },
  menuSub: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginTop: spacing[1],
  },
  aiItem: {
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent10,
  },
  aiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[4],
  },
  aiIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  aiIconText: {
    color: "#fff",
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuContent: { flex: 1 },
  chevron: {
    fontSize: fontSize.h4,
    color: colors.muted,
    marginLeft: spacing[3],
  },
  aiContent: { flex: 1 },
  aiLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
});
