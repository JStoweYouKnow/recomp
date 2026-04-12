import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, fontSize, fontWeight, radius } from "../../theme";

type Variant = "accent" | "warm" | "muted";

interface BadgeProps {
  label: string;
  variant?: Variant;
  style?: ViewStyle;
}

const variantStyles: Record<Variant, { bg: string; text: string }> = {
  accent: { bg: colors.accent10, text: colors.accent },
  warm: { bg: "rgba(184, 149, 107, 0.08)", text: colors.accentWarm },
  muted: { bg: colors.surfaceElevated, text: colors.muted },
};

export function Badge({ label, variant = "muted", style }: BadgeProps) {
  const v = variantStyles[variant];
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }, style]}>
      <Text style={[styles.text, { color: v.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
});
