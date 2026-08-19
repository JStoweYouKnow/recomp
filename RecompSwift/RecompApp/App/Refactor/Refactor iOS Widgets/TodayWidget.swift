//
//  TodayWidget.swift
//  RefactorWidgetsiOS
//
//  NOT YET IN THE BUILD — see README.md in this folder. Add an iOS Widget Extension
//  target in Xcode, drop this file into it, and enable the shared App Group.
//
//  The data layer this reads (TodayWidgetSnapshot / …Store / …Publisher) is already
//  live in RefactorKit and republished on every sync, so this has real data on day one.
//

import AppIntents
import SwiftUI
import WidgetKit
import RefactorKit

// MARK: - Timeline

struct TodayEntry: TimelineEntry {
    let date: Date
    /// Nil when the app has never synced, or the stored snapshot is from a previous day.
    let snapshot: TodayWidgetSnapshot?
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(
            TodayEntry(
                date: .now,
                snapshot: context.isPreview ? .placeholder : TodayWidgetSnapshotStore.load()
            )
        )
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: .now, snapshot: TodayWidgetSnapshotStore.load())
        // The app reloads timelines on every sync, so this is only a safety net for a day
        // rolling over while the phone sits idle.
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

// MARK: - Palette

private enum WidgetPalette {
    /// Mirrors the app's earth-tone brand. Widgets can't see the asset catalogue's
    /// named colours unless they're added to this target, so these are literals.
    static let accent = Color(red: 0.42, green: 0.49, blue: 0.24)   // #6b7c3c olive
    static let sage = Color(red: 0.49, green: 0.55, blue: 0.29)     // #7d8c4a
    static let warm = Color(red: 0.72, green: 0.58, blue: 0.42)     // #b8956b
    static let error = Color(red: 0.71, green: 0.29, blue: 0.20)    // #b54a32

    static func tint(_ snapshot: TodayWidgetSnapshot) -> Color {
        if snapshot.isOverBudget { return error }
        return snapshot.calorieProgress > 0.9 ? warm : accent
    }
}

// MARK: - Pieces

private struct CalorieRing: View {
    let snapshot: TodayWidgetSnapshot
    var lineWidth: CGFloat = 9
    var showCaption: Bool = true

    private var tint: Color { WidgetPalette.tint(snapshot) }

    var body: some View {
        ZStack {
            Circle().stroke(tint.opacity(0.16), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(snapshot.calorieProgress, 0.001))
                .stroke(
                    LinearGradient(
                        colors: [WidgetPalette.sage, tint],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            VStack(spacing: 0) {
                Text("\(snapshot.isOverBudget ? snapshot.caloriesOver : snapshot.caloriesRemaining)")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .foregroundStyle(snapshot.isOverBudget ? WidgetPalette.error : .primary)
                if showCaption {
                    Text(snapshot.isOverBudget ? "over" : "left")
                        .font(.system(size: 10, weight: .semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(lineWidth + 4)
        }
    }
}

private struct MacroBar: View {
    let label: String
    let consumed: Double
    let target: Double
    let tint: Color

    private var progress: Double {
        guard target > 0 else { return 0 }
        return min(consumed / target, 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 3) {
                Text(label)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(tint)
                Spacer(minLength: 0)
                Text("\(Int(consumed))/\(Int(target))")
                    .font(.system(size: 9, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Capsule()
                .fill(tint.opacity(0.16))
                .frame(height: 4)
                .overlay(alignment: .leading) {
                    GeometryReader { geo in
                        Capsule().fill(tint).frame(width: geo.size.width * progress)
                    }
                }
                .frame(height: 4)
        }
    }
}

private struct WidgetUnavailableView: View {
    var compact: Bool = false

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(compact ? .title3 : .title2)
                .foregroundStyle(WidgetPalette.accent)
            Text("Open Refactor")
                .font(compact ? .caption2 : .caption)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)
            if !compact {
                Text("to sync today's numbers")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Small

struct CalorieRingWidgetView: View {
    let entry: TodayEntry

    var body: some View {
        if let snapshot = entry.snapshot {
            VStack(spacing: 6) {
                CalorieRing(snapshot: snapshot).frame(maxHeight: .infinity)
                HStack(spacing: 4) {
                    if snapshot.loggingStreak >= 2 {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(WidgetPalette.warm)
                        Text("\(snapshot.loggingStreak)")
                            .font(.system(size: 11, weight: .bold))
                            .monospacedDigit()
                    }
                    Text("\(snapshot.caloriesConsumed) / \(snapshot.caloriesTarget)")
                        .font(.system(size: 10, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Calorie budget")
            .accessibilityValue(
                snapshot.isOverBudget
                ? "\(snapshot.caloriesOver) calories over budget"
                : "\(snapshot.caloriesRemaining) calories remaining"
            )
        } else {
            WidgetUnavailableView(compact: true)
        }
    }
}

struct CalorieRingWidget: Widget {
    let kind = "RecompCalorieRing"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            CalorieRingWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Calories Left")
        .description("Your remaining calorie budget for today.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Medium

struct TodayWidgetView: View {
    let entry: TodayEntry

    var body: some View {
        if let snapshot = entry.snapshot {
            HStack(spacing: 14) {
                CalorieRing(snapshot: snapshot, lineWidth: 8)
                    .frame(width: 78, height: 78)

                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 5) {
                        Text(snapshot.isOverBudget ? "Over budget" : "Calories left")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.secondary)
                        if snapshot.loggingStreak >= 2 {
                            Spacer(minLength: 0)
                            Image(systemName: "flame.fill")
                                .font(.system(size: 9))
                                .foregroundStyle(WidgetPalette.warm)
                            Text("\(snapshot.loggingStreak)")
                                .font(.system(size: 11, weight: .bold))
                                .monospacedDigit()
                        }
                    }

                    HStack(spacing: 8) {
                        MacroBar(label: "P", consumed: snapshot.proteinConsumed, target: snapshot.proteinTarget, tint: WidgetPalette.accent)
                        MacroBar(label: "C", consumed: snapshot.carbsConsumed, target: snapshot.carbsTarget, tint: WidgetPalette.warm)
                        MacroBar(label: "F", consumed: snapshot.fatConsumed, target: snapshot.fatTarget, tint: WidgetPalette.sage)
                    }

                    Divider()
                    workoutLine(snapshot)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            WidgetUnavailableView()
        }
    }

    @ViewBuilder
    private func workoutLine(_ snapshot: TodayWidgetSnapshot) -> some View {
        if snapshot.hasWorkout {
            HStack(spacing: 6) {
                Image(systemName: snapshot.workoutComplete ? "checkmark.circle.fill" : "dumbbell.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(snapshot.workoutComplete ? WidgetPalette.sage : WidgetPalette.accent)
                Text(snapshot.workoutDayLabel ?? "Workout")
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text("\(snapshot.workoutCompletedCount)/\(snapshot.workoutExerciseCount)")
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(snapshot.workoutComplete ? WidgetPalette.sage : .secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                "\(snapshot.workoutDayLabel ?? "Workout"), \(snapshot.workoutCompletedCount) of \(snapshot.workoutExerciseCount) exercises done"
            )
        } else {
            HStack(spacing: 6) {
                Image(systemName: "figure.walk")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                Text("Rest day")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
        }
    }
}

struct TodayWidget: Widget {
    let kind = "RecompToday"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Today")
        .description("Calories, macros, and today's workout at a glance.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Lock Screen

struct AccessoryCalorieWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            if let snapshot = entry.snapshot {
                Gauge(value: snapshot.calorieProgress) {
                    Image(systemName: "flame.fill")
                } currentValueLabel: {
                    Text("\(snapshot.isOverBudget ? snapshot.caloriesOver : snapshot.caloriesRemaining)")
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                }
                .gaugeStyle(.accessoryCircular)
                .accessibilityLabel("Calories remaining")
            } else {
                Gauge(value: 0) {
                    Image(systemName: "flame")
                } currentValueLabel: {
                    Text("—")
                }
                .gaugeStyle(.accessoryCircular)
            }

        case .accessoryInline:
            if let snapshot = entry.snapshot {
                Label(
                    snapshot.isOverBudget
                    ? "\(snapshot.caloriesOver) cal over"
                    : "\(snapshot.caloriesRemaining) cal left",
                    systemImage: "flame.fill"
                )
            } else {
                Label("Open Refactor", systemImage: "flame")
            }

        default:
            if let snapshot = entry.snapshot {
                VStack(alignment: .leading, spacing: 2) {
                    Text(snapshot.isOverBudget ? "\(snapshot.caloriesOver) over" : "\(snapshot.caloriesRemaining) left")
                        .font(.headline)
                        .monospacedDigit()
                    Text("P \(Int(snapshot.proteinConsumed))/\(Int(snapshot.proteinTarget))g")
                        .font(.caption)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("Open Refactor").font(.caption)
            }
        }
    }
}

struct AccessoryCalorieWidget: Widget {
    let kind = "RecompAccessoryCalories"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            AccessoryCalorieWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Calories Left")
        .description("Your calorie budget on the Lock Screen.")
        .supportedFamilies([.accessoryCircular, .accessoryInline, .accessoryRectangular])
    }
}

// MARK: - Control Center tiles (iOS 18+)

/// Logs water without opening the app — `LogWaterIntent` writes to the shared store
/// and flags a pending sync.
struct LogWaterControl: ControlWidget {
    static let kind = "com.recomp.ios.control.logWater"

    var body: some ControlWidgetConfiguration {
        AppIntentControlConfiguration(kind: Self.kind, provider: AmountProvider()) { value in
            ControlWidgetButton(action: LogWaterIntent(amountMl: value.amountMl)) {
                Label("\(value.amountMl) ml", systemImage: "drop.fill")
            }
        }
        .displayName("Log Water")
        .description("Log a glass of water to Refactor.")
    }

    struct Value {
        var amountMl: Int
    }

    struct AmountProvider: AppIntentControlValueProvider {
        func previewValue(configuration: LogWaterControlConfiguration) -> Value {
            Value(amountMl: configuration.amountMl)
        }

        func currentValue(configuration: LogWaterControlConfiguration) async throws -> Value {
            Value(amountMl: max(configuration.amountMl, 1))
        }
    }
}

struct LogWaterControlConfiguration: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "Water Amount"
    static var description = IntentDescription("Choose how much water one tap logs.")

    @Parameter(title: "Amount (ml)", default: 250)
    var amountMl: Int
}

struct StartWorkoutControl: ControlWidget {
    static let kind = "com.recomp.ios.control.startWorkout"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: StartTodaysWorkoutIntent()) {
                Label("Start Workout", systemImage: "dumbbell.fill")
            }
        }
        .displayName("Start Workout")
        .description("Jump to today's workout in Refactor.")
    }
}

// MARK: - Bundle

@main
struct RefactorWidgetsiOSBundle: WidgetBundle {
    var body: some Widget {
        CalorieRingWidget()
        TodayWidget()
        AccessoryCalorieWidget()
        LogWaterControl()
        StartWorkoutControl()
    }
}
