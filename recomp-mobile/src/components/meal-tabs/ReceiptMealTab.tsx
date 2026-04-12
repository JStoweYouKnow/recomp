import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "../ui";
import { colors, fontSize, spacing } from "../../theme";

interface ReceiptMealTabProps {
  loading: boolean;
  onPress: () => void;
}

export function ReceiptMealTab({ loading, onPress }: ReceiptMealTabProps) {
  return (
    <View style={styles.content}>
      <Button
        title={loading ? "Scanning..." : "Choose receipt photo"}
        onPress={onPress}
        loading={loading}
      />
      <Text style={styles.sub} accessibilityRole="text">
        Photo a grocery receipt. AI will extract food items with nutrition.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[5] },
  sub: { fontSize: fontSize.small, color: colors.muted, marginTop: spacing[2] },
});
