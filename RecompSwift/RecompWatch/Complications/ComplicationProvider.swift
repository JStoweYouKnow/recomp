import SwiftData
import SwiftUI
import WidgetKit
import RefactorKit

struct CalorieEntry: TimelineEntry {
    let date: Date
    let caloriesRemaining: Int
    let calorieTarget: Int
    let streakDays: Int
    let protein: Double
    let proteinTarget: Double
    let carbs: Double
    let carbsTarget: Double
    let fat: Double
    let fatTarget: Double
}

struct RefactorComplicationProvider: TimelineProvider {
    /// Used when the App Group store is unavailable (misconfiguration or migration failure).
    private static let fallbackEntry = CalorieEntry(
        date: .now,
        caloriesRemaining: 0,
        calorieTarget: 2000,
        streakDays: 0,
        protein: 0, proteinTarget: 150,
        carbs: 0, carbsTarget: 200,
        fat: 0, fatTarget: 65
    )

    func placeholder(in context: Context) -> CalorieEntry {
        CalorieEntry(
            date: .now,
            caloriesRemaining: 1200,
            calorieTarget: 2000,
            streakDays: 7,
            protein: 80, proteinTarget: 150,
            carbs: 100, carbsTarget: 200,
            fat: 30, fatTarget: 65
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (CalorieEntry) -> Void) {
        Task { @MainActor in
            completion(Self.buildEntryFromSharedStore())
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalorieEntry>) -> Void) {
        Task { @MainActor in
            let entry = Self.buildEntryFromSharedStore()
            let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now.addingTimeInterval(900)
            completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
        }
    }

    /// Reads the App Group SwiftData store and phone-pushed snapshot (same as watch dashboard).
    @MainActor
    private static func buildEntryFromSharedStore() -> CalorieEntry {
        do {
            let container = try RefactorSchema.makeContainer(appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier)
            let ctx = ModelContext(container)
            let metrics = WatchDashboardMetricsResolver.resolve(context: ctx)
            let consumed = metrics.consumed
            let targets = metrics.targets
            let adjustedCalorieTarget = metrics.adjustedCalorieTarget
            let streak = streakFromSharedStore(context: ctx)

            let remaining = max(adjustedCalorieTarget - consumed.calories, 0)
            return CalorieEntry(
                date: .now,
                caloriesRemaining: remaining,
                calorieTarget: max(adjustedCalorieTarget, 1),
                streakDays: streak,
                protein: consumed.protein,
                proteinTarget: max(targets.protein, 1),
                carbs: consumed.carbs,
                carbsTarget: max(targets.carbs, 1),
                fat: consumed.fat,
                fatTarget: max(targets.fat, 1)
            )
        } catch {
            return Self.fallbackEntry
        }
    }

    @MainActor
    private static func streakFromSharedStore(context: ModelContext? = nil) -> Int {
        do {
            let ctx: ModelContext
            if let context {
                ctx = context
            } else {
                let container = try RefactorSchema.makeContainer(appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier)
                ctx = ModelContext(container)
            }
            let allMeals = (try? ctx.fetch(FetchDescriptor<MealEntry>())) ?? []
            return DateHelpers.streakLength(dates: Array(Set(allMeals.map(\.date))))
        } catch {
            return 0
        }
    }
}

struct CalorieRingComplication: View {
    let entry: CalorieEntry

    var body: some View {
        // Fill by calories consumed (matches the phone dashboard ring), derived from
        // remaining vs target so the two surfaces never disagree.
        let consumed = max(entry.calorieTarget - entry.caloriesRemaining, 0)
        let progress = Double(consumed) / Double(max(entry.calorieTarget, 1))

        ZStack {
            AccessoryWidgetBackground()
            ZStack {
                Circle()
                    .stroke(.orange.opacity(0.3), lineWidth: 4)
                Circle()
                    .trim(from: 0, to: min(max(progress, 0), 1.0))
                    .stroke(.orange, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(entry.caloriesRemaining)")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
            }
            .padding(4)
        }
    }
}

struct MacroBarComplication: View {
    let entry: CalorieEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("\(entry.caloriesRemaining) cal left")
                .font(.system(size: 10, weight: .semibold))

            macroBar("P", current: entry.protein, target: entry.proteinTarget, color: .red)
            macroBar("C", current: entry.carbs, target: entry.carbsTarget, color: .blue)
            macroBar("F", current: entry.fat, target: entry.fatTarget, color: .yellow)
        }
    }

    private func macroBar(_ label: String, current: Double, target: Double, color: Color) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(color)
                .frame(width: 10)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(color.opacity(0.2))
                    RoundedRectangle(cornerRadius: 2)
                        .fill(color)
                        .frame(width: geo.size.width * min(current / max(target, 1), 1.0))
                }
            }
            .frame(height: 4)
        }
    }
}

struct InlineComplication: View {
    let entry: CalorieEntry

    var body: some View {
        Text("\(entry.caloriesRemaining) cal left · \(entry.streakDays)d streak")
    }
}

// NOTE: When creating the Xcode project, place this file in a separate
// Widget Extension target with its own @main entry point:
//
// @main
// struct RefactorWidgetBundle: WidgetBundle {
//     var body: some Widget {
//         CalorieRingWidget()
//         MacroBarWidget()
//     }
// }
//
// Do NOT include this file in the main Watch app target to avoid
// duplicate @main entry points.

struct CalorieRingWidget: Widget {
    let kind = "CalorieRing"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RefactorComplicationProvider()) { entry in
            CalorieRingComplication(entry: entry)
        }
        .configurationDisplayName("Calories")
        .description("Remaining calorie budget")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}

struct MacroBarWidget: Widget {
    let kind = "MacroBars"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RefactorComplicationProvider()) { entry in
            MacroBarComplication(entry: entry)
        }
        .configurationDisplayName("Macros")
        .description("Macro progress bars")
        .supportedFamilies([.accessoryRectangular])
    }
}
