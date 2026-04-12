import React from "react";
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from "react-native";
import { colors, fontSize, fontWeight, radius, spacing } from "../../theme";

interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  containerStyle,
  ...props
}: InputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={colors.muted}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
  },
  label: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
    marginBottom: spacing[2],
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: fontSize.body,
    color: colors.foreground,
  },
  inputError: {
    borderColor: colors.accentTerracotta,
  },
  error: {
    fontSize: fontSize.caption,
    color: colors.accentTerracotta,
    marginTop: spacing[1],
  },
});
