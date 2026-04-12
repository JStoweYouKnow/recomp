import React, { Component, type ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "./ui";
import { colors, fontSize, fontWeight, spacing } from "../theme";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error.message || "An unexpected error occurred."}
          </Text>
          <Button
            title="Try again"
            onPress={this.handleRetry}
            style={styles.retryBtn}
            accessibilityLabel="Retry loading the app"
          />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing[8],
    backgroundColor: colors.background,
  },
  title: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing[3],
  },
  message: {
    fontSize: fontSize.body,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing[6],
  },
  retryBtn: { minWidth: 140 },
});
