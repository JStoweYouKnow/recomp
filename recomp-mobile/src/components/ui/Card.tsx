import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { colors, radius, shadow, spacing } from "../../theme";

interface CardProps {
  children: React.ReactNode;
  flat?: boolean;
  style?: ViewStyle;
}

export function Card({ children, flat = false, style }: CardProps) {
  return (
    <View style={[flat ? styles.flat : styles.elevated, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  elevated: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    padding: spacing[5],
    overflow: "hidden" as const,
    ...shadow.soft,
  },
  flat: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing[5],
    overflow: "hidden" as const,
  },
});
