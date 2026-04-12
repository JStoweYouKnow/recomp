import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { colors, fontSize, fontWeight, radius, spacing } from "../../theme";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const variantStyles: Record<Variant, { container: ViewStyle; text: TextStyle }> = {
  primary: {
    container: {
      backgroundColor: colors.accent,
    },
    text: {
      color: "#faf8f5",
      fontWeight: fontWeight.semibold,
    },
  },
  secondary: {
    container: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    text: {
      color: colors.mutedForeground,
      fontWeight: fontWeight.medium,
    },
  },
  ghost: {
    container: {
      backgroundColor: "transparent",
    },
    text: {
      color: colors.mutedForeground,
      fontWeight: fontWeight.medium,
    },
  },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const v = variantStyles[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.base,
        v.container,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? "#faf8f5" : colors.muted}
        />
      ) : (
        <Text style={[styles.text, variant !== "primary" && styles.textSmall, v.text, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: fontSize.body,
  },
  textSmall: {
    fontSize: fontSize.small,
  },
  disabled: {
    opacity: 0.5,
  },
});
