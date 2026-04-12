import React from "react";
import { View, TouchableOpacity, Text, ScrollView, StyleSheet } from "react-native";
import { Button, Input } from "../ui";
import { colors, fontSize, fontWeight, spacing } from "../../theme";
import type { MealEntry } from "../../lib/types";

interface TextMealTabProps {
  name: string;
  setName: (v: string) => void;
  cal: string;
  setCal: (v: string) => void;
  pro: string;
  setPro: (v: string) => void;
  carb: string;
  setCarb: (v: string) => void;
  fat: string;
  setFat: (v: string) => void;
  mealType: MealEntry["mealType"];
  setMealType: (v: MealEntry["mealType"]) => void;
  onSubmit: () => void;
  onSuggest: () => void;
  loading: boolean;
  suggestLoading: boolean;
}

export function TextMealTab({
  name,
  setName,
  cal,
  setCal,
  pro,
  setPro,
  carb,
  setCarb,
  fat,
  setFat,
  mealType,
  setMealType,
  onSubmit,
  onSuggest,
  loading,
  suggestLoading,
}: TextMealTabProps) {
  return (
    <ScrollView style={styles.content}>
      <Input
        label="Meal name"
        placeholder="e.g. Grilled chicken salad"
        value={name}
        onChangeText={setName}
        accessibilityLabel="Meal name"
        accessibilityHint="Enter the name of your meal"
      />
      <View style={styles.mealTypeRow}>
        {(["breakfast", "lunch", "dinner", "snack"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.mealTypeBtn, mealType === t && styles.mealTypeBtnActive]}
            onPress={() => setMealType(t)}
            accessibilityRole="button"
            accessibilityState={{ selected: mealType === t }}
            accessibilityLabel={`${t} meal type`}
          >
            <Text style={[styles.mealTypeText, mealType === t && styles.mealTypeTextActive]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.macrosRow}>
        <Input
          label="Cal"
          value={cal}
          onChangeText={setCal}
          keyboardType="number-pad"
          containerStyle={styles.macroInput}
          accessibilityLabel="Calories"
        />
        <Input
          label="Protein"
          value={pro}
          onChangeText={setPro}
          keyboardType="number-pad"
          containerStyle={styles.macroInput}
          accessibilityLabel="Protein in grams"
        />
        <Input
          label="Carbs"
          value={carb}
          onChangeText={setCarb}
          keyboardType="number-pad"
          containerStyle={styles.macroInput}
          accessibilityLabel="Carbs in grams"
        />
        <Input
          label="Fat"
          value={fat}
          onChangeText={setFat}
          keyboardType="number-pad"
          containerStyle={styles.macroInput}
          accessibilityLabel="Fat in grams"
        />
      </View>
      <Button
        title={suggestLoading ? "..." : "Suggest"}
        onPress={onSuggest}
        variant="secondary"
        disabled={suggestLoading}
        style={styles.suggestBtn}
      />
      <Button title="Add meal" onPress={onSubmit} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[5] },
  mealTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  mealTypeBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
  },
  mealTypeBtnActive: {
    backgroundColor: colors.accent10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  mealTypeText: { fontSize: fontSize.small, color: colors.mutedForeground },
  mealTypeTextActive: { color: colors.accent, fontWeight: fontWeight.semibold },
  macrosRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[3] },
  macroInput: { flex: 1, minWidth: 70, marginBottom: 0 },
  suggestBtn: { marginBottom: spacing[4] },
});
