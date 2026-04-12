import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/** A single pulsing skeleton placeholder. */
export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = radius.sm,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: colors.surfaceElevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Dashboard loading skeleton. */
export function DashboardSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {/* Budget bar skeleton */}
      <View style={skeletonStyles.card}>
        <Skeleton width="60%" height={20} style={skeletonStyles.mb12} />
        <Skeleton width="100%" height={12} borderRadius={6} style={skeletonStyles.mb8} />
        <View style={skeletonStyles.row}>
          <Skeleton width="22%" height={48} borderRadius={radius.md} />
          <Skeleton width="22%" height={48} borderRadius={radius.md} />
          <Skeleton width="22%" height={48} borderRadius={radius.md} />
          <Skeleton width="22%" height={48} borderRadius={radius.md} />
        </View>
      </View>

      {/* Calendar skeleton */}
      <View style={skeletonStyles.card}>
        <Skeleton width="40%" height={16} style={skeletonStyles.mb12} />
        <View style={skeletonStyles.row}>
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} width={36} height={48} borderRadius={radius.md} />
          ))}
        </View>
      </View>

      {/* Cards skeleton */}
      <View style={skeletonStyles.card}>
        <Skeleton width="50%" height={18} style={skeletonStyles.mb8} />
        <Skeleton width="100%" height={14} style={skeletonStyles.mb8} />
        <Skeleton width="80%" height={14} />
      </View>

      <View style={skeletonStyles.card}>
        <Skeleton width="45%" height={18} style={skeletonStyles.mb8} />
        <Skeleton width="100%" height={14} style={skeletonStyles.mb8} />
        <Skeleton width="70%" height={14} />
      </View>
    </View>
  );
}

/** Meals list loading skeleton. */
export function MealsSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={skeletonStyles.card}>
          <View style={skeletonStyles.rowSpaced}>
            <Skeleton width="40%" height={16} />
            <Skeleton width="20%" height={14} />
          </View>
          <Skeleton width="60%" height={14} style={skeletonStyles.mt8} />
          <View style={[skeletonStyles.row, skeletonStyles.mt8]}>
            <Skeleton width="18%" height={12} />
            <Skeleton width="18%" height={12} />
            <Skeleton width="18%" height={12} />
            <Skeleton width="18%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Workouts list loading skeleton. */
export function WorkoutsSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.card}>
        <Skeleton width="50%" height={20} style={skeletonStyles.mb12} />
        <Skeleton width="30%" height={14} style={skeletonStyles.mb12} />
      </View>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={skeletonStyles.card}>
          <Skeleton width="55%" height={16} style={skeletonStyles.mb8} />
          <View style={skeletonStyles.row}>
            <Skeleton width="25%" height={12} />
            <Skeleton width="25%" height={12} />
            <Skeleton width="25%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    padding: spacing[5],
    gap: spacing[4],
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing[5],
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  row: {
    flexDirection: "row",
    gap: spacing[2],
  },
  rowSpaced: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mt8: { marginTop: 8 },
});
