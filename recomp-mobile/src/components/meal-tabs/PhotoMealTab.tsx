import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "../ui";
import { colors, fontSize, spacing } from "../../theme";

interface PhotoMealTabProps {
  loading: boolean;
  onPress: () => void;
}

export function PhotoMealTab({ loading, onPress }: PhotoMealTabProps) {
  return (
    <View style={styles.content}>
      <Button
        title={loading ? "Analyzing..." : "Choose photo"}
        onPress={onPress}
        loading={loading}
      />
      <Text style={styles.sub} accessibilityRole="text">
        Snap your plate or choose from library. AI will estimate macros.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[5] },
  sub: { fontSize: fontSize.small, color: colors.muted, marginTop: spacing[2] },
});
