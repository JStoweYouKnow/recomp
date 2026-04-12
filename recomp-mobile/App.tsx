import React, { useEffect, useState, useCallback, useRef } from "react";
import { AppState, AppStateStatus, View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { initSentry, Sentry } from "./src/lib/sentry";
import { startAutoSync, stopAutoSync, flush } from "./src/lib/sync-queue";
import {
  shouldRequireAuth,
  authenticate,
  recordBackgroundTime,
  isBiometricEnabled,
} from "./src/lib/biometric";

// Initialize Sentry before anything else
initSentry();

function AppContent() {
  const [locked, setLocked] = useState(false);
  const appState = useRef(AppState.currentState);

  // Auto-sync queue on startup
  useEffect(() => {
    startAutoSync();
    flush().catch(() => {});
    return () => stopAutoSync();
  }, []);

  // Biometric lock on app foreground
  const handleAppStateChange = useCallback(async (nextState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextState === "active") {
      const needsAuth = await shouldRequireAuth();
      if (needsAuth) {
        setLocked(true);
        const ok = await authenticate();
        setLocked(!ok);
      }
      flush().catch(() => {});
    }

    if (nextState.match(/inactive|background/)) {
      const enabled = await isBiometricEnabled();
      if (enabled) {
        await recordBackgroundTime();
      }
    }

    appState.current = nextState;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [handleAppStateChange]);

  if (locked) {
    return (
      <View style={lockStyles.container}>
        <Text style={lockStyles.icon}>🔒</Text>
        <Text style={lockStyles.title}>Recomp is Locked</Text>
        <Text
          style={lockStyles.unlock}
          onPress={async () => {
            const ok = await authenticate();
            if (ok) setLocked(false);
          }}
        >
          Tap to unlock
        </Text>
      </View>
    );
  }

  return <RootNavigator />;
}

function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AppContent />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const lockStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#faf8f5",
    padding: 40,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "600", color: "#3d3730", marginBottom: 12 },
  unlock: { fontSize: 16, color: "#6b7c3c", fontWeight: "500" },
});

export default Sentry.wrap(App);
