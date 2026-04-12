import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "../ui";
import { colors, fontSize, spacing } from "../../theme";

interface VoiceMealTabProps {
  voiceAvailable: boolean | null;
  voiceListening: boolean;
  voiceLoading: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceMealTab({
  voiceAvailable,
  voiceListening,
  voiceLoading,
  onStart,
  onStop,
}: VoiceMealTabProps) {
  if (voiceAvailable === false) {
    return (
      <View style={styles.content}>
        <Text style={styles.text} accessibilityRole="text">
          Voice recognition is not available on this device.
        </Text>
        <Text style={styles.sub}>Use Text or Photo to log meals.</Text>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <Text style={styles.text} accessibilityRole="text">
        {voiceListening
          ? "Speak your meal..."
          : "Tap below and describe what you ate. AI will parse it into macros."}
      </Text>
      <Button
        title={
          voiceListening ? "Stop" : voiceLoading ? "Parsing..." : "Speak your meal"
        }
        onPress={voiceListening ? onStop : onStart}
        loading={voiceLoading}
        disabled={voiceAvailable === null}
        style={styles.voiceBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[5] },
  text: { fontSize: fontSize.body, color: colors.foreground, marginBottom: spacing[2] },
  sub: { fontSize: fontSize.small, color: colors.muted },
  voiceBtn: { marginTop: spacing[2] },
});
