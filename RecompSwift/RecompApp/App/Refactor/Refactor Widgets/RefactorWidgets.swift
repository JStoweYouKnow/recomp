//
//  RefactorWidgets.swift
//  RefactorWidgets (watchOS complications)
//
//  This extension is the only target with a `@main` WidgetBundle, so the watch's
//  complications have to be declared here. `RecompWatch/Complications/ComplicationProvider.swift`
//  belongs to the Watch App target, which the extension cannot see — the views below are
//  deliberately self-contained rather than shared.
//

import SwiftUI
import WidgetKit
import RefactorKit

// MARK: - Timeline

struct TodayEntry: TimelineEntry {
    let date: Date
    /// Nil when the phone has never synced, or the stored snapshot is from a previous day.
    let snapshot: TodayWidgetSnapshot?
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        if context.isPreview {
            completion(TodayEntry(date: .now, snapshot: .placeholder))
        } else {
            completion(TodayEntry(date: .now, snapshot: TodayWidgetSnapshotStore.load()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: .now, snapshot: TodayWidgetSnapshotStore.load())
        // The phone reloads timelines on every sync; this is the fallback for a quiet
        // day. Refresh hourly, and never later than midnight so a stale day's numbers
        // cannot sit on the watch face.
        let nextHour = Calendar.current.date(byAdding: .hour, value: 1, to: .now)
            ?? .now.addingTimeInterval(3600)
        let nextMidnight = Calendar.current.nextDate(
            after: .now,
            matching: DateComponents(hour: 0, minute: 0),
            matchingPolicy: .nextTime
        ) ?? nextHour
        completion(Timeline(entries: [entry], policy: .after(min(nextHour, nextMidnight))))
    }
}

// MARK: - Shared pieces

private enum ComplicationPalette {
    /// Olive accent, matching the phone app's `Color.appAccent` (#6b7c3c).
    static let accent = Color(red: 0.42, green: 0.49, blue: 0.24)
    static let warm = Color(red: 0.72, green: 0.58, blue: 0.42)
    static let error = Color(red: 0.71, green: 0.29, blue: 0.20)

    static func tint(_ snapshot: TodayWidgetSnapshot) -> Color {
        if snapshot.isOverBudget { return error }
        return snapshot.calorieProgress > 0.9 ? warm : accent
    }
}

/// The number the user raises their wrist to see.
private func calorieHeadline(_ snapshot: TodayWidgetSnapshot) -> String {
    "\(snapshot.isOverBudget ? snapshot.caloriesOver : snapshot.caloriesRemaining)"
}

// MARK: - Circular: calorie ring

struct CalorieCircularView: View {
    let entry: TodayEntry

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let snapshot = entry.snapshot {
                Gauge(value: snapshot.calorieProgress) {
                    Image(systemName: "flame.fill")
                } currentValueLabel: {
                    Text(calorieHeadline(snapshot))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                }
                .gaugeStyle(.accessoryCircular)
                .tint(ComplicationPalette.tint(snapshot))
                .accessibilityLabel("Calories")
                .accessibilityValue(
                    snapshot.isOverBudget
                    ? "\(snapshot.caloriesOver) over budget"
                    : "\(snapshot.caloriesRemaining) remaining"
                )
            } else {
                VStack(spacing: 1) {
                    Image(systemName: "flame")
                        .font(.system(size: 12))
                    Text("—")
                        .font(.system(size: 13, weight: .semibold))
                }
                .accessibilityLabel("Calories unavailable. Open Refactor on your phone to sync.")
            }
        }
    }
}

struct CalorieCircularComplication: Widget {
    let kind = "RecompCalorieCircular"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            CalorieCircularView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Calories Left")
        .description("Your remaining calorie budget.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}

// MARK: - Rectangular: macros + workout

struct MacroRectangularView: View {
    let entry: TodayEntry

    var body: some View {
        if let snapshot = entry.snapshot {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(ComplicationPalette.tint(snapshot))
                    Text(snapshot.isOverBudget
                         ? "\(snapshot.caloriesOver) over"
                         : "\(snapshot.caloriesRemaining) left")
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                    Spacer(minLength: 0)
                    if snapshot.loggingStreak >= 2 {
                        Text("\(snapshot.loggingStreak)d")
                            .font(.system(size: 10, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }

                macroBar("P", snapshot.proteinConsumed, snapshot.proteinTarget)
                macroBar("C", snapshot.carbsConsumed, snapshot.carbsTarget)
                macroBar("F", snapshot.fatConsumed, snapshot.fatTarget)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Macros")
            .accessibilityValue(
                "\(snapshot.caloriesRemaining) calories left. Protein \(Int(snapshot.proteinConsumed)) of \(Int(snapshot.proteinTarget)) grams."
            )
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text("Refactor")
                    .font(.system(size: 13, weight: .semibold))
                Text("Open on your phone to sync")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func macroBar(_ label: String, _ consumed: Double, _ target: Double) -> some View {
        let progress = target > 0 ? min(consumed / target, 1) : 0
        return HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 8, weight: .bold))
                .frame(width: 8, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(.tertiary)
                    Capsule()
                        .fill(ComplicationPalette.accent)
                        .frame(width: geo.size.width * progress)
                }
            }
            .frame(height: 3)
        }
    }
}

struct MacroRectangularComplication: Widget {
    let kind = "RecompMacroRectangular"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            MacroRectangularView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Macros")
        .description("Calories left and macro progress.")
        .supportedFamilies([.accessoryRectangular])
    }
}

// MARK: - Inline: one line above the watch face

struct CalorieInlineView: View {
    let entry: TodayEntry

    var body: some View {
        if let snapshot = entry.snapshot {
            if snapshot.hasWorkout && !snapshot.workoutComplete {
                Label(
                    "\(snapshot.caloriesRemaining) cal · \(snapshot.workoutCompletedCount)/\(snapshot.workoutExerciseCount) lifts",
                    systemImage: "flame.fill"
                )
            } else {
                Label(
                    snapshot.isOverBudget
                    ? "\(snapshot.caloriesOver) cal over"
                    : "\(snapshot.caloriesRemaining) cal left",
                    systemImage: "flame.fill"
                )
            }
        } else {
            Label("Open Refactor", systemImage: "flame")
        }
    }
}

struct CalorieInlineComplication: Widget {
    let kind = "RecompCalorieInline"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            CalorieInlineView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Calories Inline")
        .description("Calories left as a single line.")
        .supportedFamilies([.accessoryInline])
    }
}
