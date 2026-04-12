import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, fontSize, fontWeight, spacing, radius } from "../theme";

const DAY_NAMES = ["M", "T", "W", "T", "F", "S", "S"];

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayIdx(d: Date): number {
  const dow = d.getDay();
  return dow === 0 ? 6 : dow - 1;
}

function getWeekDays(centerDate: Date): Date[] {
  const monday = new Date(centerDate);
  monday.setDate(centerDate.getDate() - mondayIdx(centerDate));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

interface CalendarViewProps {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
}

export function CalendarView({ selectedDate, onSelectDate }: CalendarViewProps) {
  const today = toIso(new Date());
  const center = new Date(selectedDate);
  const week = getWeekDays(center);

  return (
    <View style={styles.container}>
      <View style={styles.weekRow}>
        {DAY_NAMES.map((name, i) => (
          <View key={i} style={styles.dayHeader}>
            <Text style={styles.dayHeaderText}>{name}</Text>
          </View>
        ))}
      </View>
      <View style={styles.weekRow}>
        {week.map((d) => {
          const iso = toIso(d);
          const isSelected = iso === selectedDate;
          const isToday = iso === today;
          return (
            <TouchableOpacity
              key={iso}
              style={[
                styles.dayCell,
                isSelected && styles.dayCellSelected,
                isToday && !isSelected && styles.dayCellToday,
              ]}
              onPress={() => onSelectDate(iso)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dayNum,
                  isSelected && styles.dayNumSelected,
                  isToday && !isSelected && styles.dayNumToday,
                ]}
              >
                {d.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing[4],
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing[3],
  },
  dayHeader: {
    flex: 1,
    alignItems: "center",
  },
  dayHeaderText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.muted,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: "transparent",
  },
  dayCellSelected: {
    backgroundColor: colors.accent,
  },
  dayCellToday: {
    backgroundColor: colors.accent10,
  },
  dayNum: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.normal,
    color: colors.foreground,
  },
  dayNumSelected: {
    color: "#faf8f5",
    fontWeight: fontWeight.semibold,
  },
  dayNumToday: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
});
