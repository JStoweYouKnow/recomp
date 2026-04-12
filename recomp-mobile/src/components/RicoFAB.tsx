import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { colors, fontSize, fontWeight } from "../theme";

interface RicoFABProps {
  onPress: () => void;
}

export function RicoFAB({ onPress }: RicoFABProps) {
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Open Reco AI coach"
      accessibilityHint="Opens chat with your AI fitness coach"
    >
      <Text style={styles.label}>Reco</Text>
    </TouchableOpacity>
  );
}

const FAB_SIZE = 56;

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 80,
    right: 20,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  label: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
    color: "#fff",
  },
});
