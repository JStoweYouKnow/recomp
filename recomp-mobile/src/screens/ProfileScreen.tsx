import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Switch } from "react-native";
import { useAuthStore } from "../store/authStore";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { Card, Button, Input } from "../components/ui";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  getBiometricType,
} from "../lib/biometric";
import {
  OptionRow,
  OptionChipsMulti,
  FITNESS_LEVELS,
  GOALS,
  ACTIVITIES,
  LOCATIONS,
} from "../components/ProfileForm";
import { colors, fontSize, fontWeight, spacing } from "../theme";
import type { UserProfile, WorkoutLocation, WorkoutEquipment } from "../lib/types";
import { syncToServer } from "../lib/sync";

const kgToLbs = (kg: number) => kg * 2.2046226218;
const cmToFeetInches = (cm: number) => {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inch = Math.round(totalInches - ft * 12);
  return inch === 12 ? { ft: ft + 1, inch: 0 } : { ft, inch };
};
const poundsToKg = (lbs: number) => lbs * 0.45359237;
const feetInchesToCm = (feet: number, inches: number) =>
  (feet * 12 + inches) * 2.54;

export function ProfileScreen() {
  const { profile, setProfile, isDemoMode } = useAuthStore();
  const push = usePushNotifications();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [gender, setGender] = useState<UserProfile["gender"]>("other");
  const [fitnessLevel, setFitnessLevel] = useState<UserProfile["fitnessLevel"]>("intermediate");
  const [goal, setGoal] = useState<UserProfile["goal"]>("maintain");
  const [activity, setActivity] = useState<UserProfile["dailyActivityLevel"]>("moderate");
  const [workoutLocation, setWorkoutLocation] = useState<WorkoutLocation>("gym");
  const [equipment, setEquipment] = useState<WorkoutEquipment[]>(["free_weights", "machines"]);
  const [workoutDaysPerWeek, setWorkoutDaysPerWeek] = useState("");
  const [workoutTimeframe, setWorkoutTimeframe] = useState<UserProfile["workoutTimeframe"]>("flexible");
  const [restrictions, setRestrictions] = useState("");
  const [injuries, setInjuries] = useState("");
  const [saving, setSaving] = useState(false);
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric");

  useEffect(() => {
    isBiometricAvailable().then((avail) => {
      setBiometricAvail(avail);
      if (avail) {
        isBiometricEnabled().then(setBiometricOn);
        getBiometricType().then(setBiometricLabel);
      }
    });
  }, []);

  useEffect(() => {
    if (profile) {
      const { ft, inch } = cmToFeetInches(profile.height);
      setName(profile.name);
      setAge(String(profile.age));
      setWeightLbs(String(Math.round(kgToLbs(profile.weight))));
      setHeightFeet(String(ft || 5));
      setHeightInches(String(inch || 7));
      setGender(profile.gender);
      setFitnessLevel(profile.fitnessLevel);
      setGoal(profile.goal);
      setActivity(profile.dailyActivityLevel);
      setWorkoutLocation(profile.workoutLocation ?? "gym");
      setEquipment(profile.workoutEquipment ?? ["free_weights", "machines"]);
      setWorkoutDaysPerWeek(String(profile.workoutDaysPerWeek ?? 4));
      setWorkoutTimeframe(profile.workoutTimeframe ?? "flexible");
      setRestrictions(profile.dietaryRestrictions?.join(", ") ?? "");
      setInjuries(profile.injuriesOrLimitations?.join(", ") ?? "");
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    const lbs = parseFloat(weightLbs);
    const feet = parseInt(heightFeet, 10);
    const inches = parseInt(heightInches, 10);
    const totalInches =
      Number.isFinite(feet) && feet > 0
        ? feet * 12 + (Number.isFinite(inches) && inches >= 0 ? inches : 0)
        : 0;

    const updated: UserProfile = {
      ...profile,
      name: name.trim() || profile.name,
      age: parseInt(age, 10) || profile.age,
      weight: Number.isFinite(lbs) && lbs > 0 ? poundsToKg(lbs) : profile.weight,
      height: totalInches > 0 ? feetInchesToCm(feet, Number.isFinite(inches) ? inches : 0) : profile.height,
      gender,
      fitnessLevel,
      goal,
      dailyActivityLevel: activity,
      workoutLocation,
      workoutEquipment: equipment,
      workoutDaysPerWeek: (Number(workoutDaysPerWeek) || profile.workoutDaysPerWeek) ?? 4,
      workoutTimeframe,
      dietaryRestrictions: restrictions.split(",").map((s) => s.trim()).filter(Boolean),
      injuriesOrLimitations: injuries.split(",").map((s) => s.trim()).filter(Boolean),
    };

    setSaving(true);
    try {
      await setProfile(updated);
      await syncToServer();
      Alert.alert("Saved", "Your profile has been updated.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          Update your details anytime. Changes apply to your plan and recommendations.
        </Text>

        {!isDemoMode && (
          <Card style={styles.pushCard}>
            <Text style={styles.sectionLabel}>Push notifications</Text>
            <Text style={styles.pushHint}>
              Get reminders for meal logging and milestones.
            </Text>
            {push.error && (
              <Text style={styles.pushError}>{push.error}</Text>
            )}
            {push.enabled ? (
              <Button
                title={push.loading ? "Turning off…" : "Turn off"}
                onPress={push.disable}
                variant="secondary"
                disabled={push.loading}
              />
            ) : (
              <Button
                title={push.loading ? "Enabling…" : "Enable notifications"}
                onPress={push.enable}
                disabled={push.loading}
              />
            )}
          </Card>
        )}

        {biometricAvail && (
          <Card style={styles.pushCard}>
            <View style={styles.biometricRow}>
              <View style={styles.biometricLabel}>
                <Text style={styles.sectionLabel}>{biometricLabel} Lock</Text>
                <Text style={styles.pushHint}>
                  Require {biometricLabel} to access the app after 5 min in background.
                </Text>
              </View>
              <Switch
                value={biometricOn}
                onValueChange={async (val) => {
                  await setBiometricEnabled(val);
                  setBiometricOn(val);
                }}
                trackColor={{ true: colors.accent, false: colors.surfaceElevated }}
                thumbColor={colors.cardBg}
                accessibilityLabel={`Toggle ${biometricLabel} lock`}
              />
            </View>
          </Card>
        )}

        <Card style={styles.card}>
          <Input
            label="Name"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            containerStyle={styles.inputBlock}
          />
          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                label="Age"
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                containerStyle={styles.inputBlock}
              />
            </View>
            <View style={styles.half}>
              <Input
                label="Weight (lbs)"
                value={weightLbs}
                onChangeText={setWeightLbs}
                keyboardType="decimal-pad"
                containerStyle={styles.inputBlock}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                label="Height (ft)"
                value={heightFeet}
                onChangeText={setHeightFeet}
                keyboardType="number-pad"
                containerStyle={styles.inputBlock}
              />
            </View>
            <View style={styles.half}>
              <Input
                label="Height (in)"
                value={heightInches}
                onChangeText={setHeightInches}
                keyboardType="number-pad"
                containerStyle={styles.inputBlock}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Fitness level</Text>
          <OptionRow
            options={FITNESS_LEVELS}
            value={fitnessLevel}
            onChange={setFitnessLevel}
          />
          <Text style={styles.sectionLabel}>Goal</Text>
          <OptionRow options={GOALS} value={goal} onChange={setGoal} />
          <Text style={styles.sectionLabel}>Activity level</Text>
          <OptionRow options={ACTIVITIES} value={activity} onChange={setActivity} />
          <Text style={styles.sectionLabel}>Workout location</Text>
          <OptionRow
            options={LOCATIONS}
            value={workoutLocation}
            onChange={setWorkoutLocation}
          />
          <Text style={styles.sectionLabel}>Equipment</Text>
          <OptionChipsMulti value={equipment} onChange={setEquipment} />
          <Input
            label="Workouts per week (2–7)"
            value={workoutDaysPerWeek}
            onChangeText={setWorkoutDaysPerWeek}
            keyboardType="number-pad"
            containerStyle={styles.inputBlock}
          />
          <View style={styles.timeframeRow}>
            <Text style={styles.sectionLabel}>Preferred time</Text>
            <View style={styles.timeframeOptions}>
              {(["morning", "afternoon", "evening", "flexible"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.optionChip, workoutTimeframe === t && styles.optionChipActive]}
                  onPress={() => setWorkoutTimeframe(t)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      workoutTimeframe === t && styles.optionTextActive,
                    ]}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Input
            label="Dietary restrictions (comma-separated)"
            placeholder="e.g. dairy-free, gluten-free"
            value={restrictions}
            onChangeText={setRestrictions}
            containerStyle={styles.inputBlock}
          />
          <Input
            label="Injuries or limitations"
            placeholder="e.g. knee injury"
            value={injuries}
            onChangeText={setInjuries}
            containerStyle={styles.inputBlock}
          />
          <Button
            title={saving ? "Saving…" : "Save changes"}
            onPress={handleSave}
            loading={saving}
            style={styles.saveBtn}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing[5], paddingBottom: spacing[16] },
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
  pushCard: { marginTop: spacing[2], marginBottom: spacing[2] },
  pushHint: {
    fontSize: fontSize.small,
    color: colors.mutedForeground,
    marginBottom: spacing[4],
  },
  pushError: {
    fontSize: fontSize.small,
    color: colors.accentTerracotta,
    marginBottom: spacing[2],
  },
  card: { marginTop: spacing[2] },
  row: { flexDirection: "row", gap: spacing[3] },
  half: { flex: 1 },
  inputBlock: { marginBottom: spacing[4] },
  sectionLabel: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
    marginBottom: spacing[2],
    marginTop: spacing[2],
  },
  timeframeRow: { marginBottom: spacing[4] },
  timeframeOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  optionChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  optionChipActive: {
    backgroundColor: colors.accent10,
    borderColor: colors.accent,
  },
  optionText: {
    fontSize: fontSize.small,
    color: colors.mutedForeground,
  },
  optionTextActive: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
  saveBtn: { marginTop: spacing[6] },
  biometricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  biometricLabel: { flex: 1, marginRight: spacing[3] },
});
