import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { WorkoutEquipment } from "../lib/types";
import { colors, fontSize, fontWeight, spacing } from "../theme";

const FITNESS_LEVELS = [
  { value: "beginner" as const, label: "Beginner" },
  { value: "intermediate" as const, label: "Intermediate" },
  { value: "advanced" as const, label: "Advanced" },
  { value: "athlete" as const, label: "Athlete" },
];

const GOALS = [
  { value: "lose_weight" as const, label: "Lose weight" },
  { value: "maintain" as const, label: "Maintain" },
  { value: "build_muscle" as const, label: "Build muscle" },
  { value: "improve_endurance" as const, label: "Improve endurance" },
];

const ACTIVITIES = [
  { value: "sedentary" as const, label: "Sedentary" },
  { value: "light" as const, label: "Light" },
  { value: "moderate" as const, label: "Moderate" },
  { value: "active" as const, label: "Active" },
  { value: "very_active" as const, label: "Very active" },
];

const LOCATIONS = [
  { value: "home" as const, label: "Home" },
  { value: "gym" as const, label: "Gym" },
  { value: "outside" as const, label: "Outside" },
];

const EQUIPMENT: { value: WorkoutEquipment; label: string }[] = [
  { value: "bodyweight", label: "Bodyweight" },
  { value: "free_weights", label: "Dumbbells" },
  { value: "barbells", label: "Barbells" },
  { value: "kettlebells", label: "Kettlebells" },
  { value: "machines", label: "Machines" },
  { value: "resistance_bands", label: "Resistance bands" },
  { value: "cardio_machines", label: "Cardio" },
  { value: "pull_up_bar", label: "Pull-up bar" },
  { value: "cable_machine", label: "Cable machine" },
];

export function OptionRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.optionsRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[styles.optionChip, value === opt.value && styles.optionChipActive]}
        >
          <Text style={[styles.optionText, value === opt.value && styles.optionTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function OptionChipsMulti({
  value,
  onChange,
}: {
  value: WorkoutEquipment[];
  onChange: (v: WorkoutEquipment[]) => void;
}) {
  const toggle = (v: WorkoutEquipment) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <View style={styles.optionsWrap}>
      {EQUIPMENT.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => toggle(opt.value)}
          style={[styles.optionChip, value.includes(opt.value) && styles.optionChipActive]}
        >
          <Text
            style={[styles.optionText, value.includes(opt.value) && styles.optionTextActive]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export { FITNESS_LEVELS, GOALS, ACTIVITIES, LOCATIONS };

const styles = StyleSheet.create({
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  optionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginBottom: spacing[4],
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
});
