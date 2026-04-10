import WidgetKit
import SwiftUI

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

struct RecompComplicationProvider: TimelineProvider {
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
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalorieEntry>) -> Void) {
        let entry = placeholder(in: context)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: .now)!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

struct CalorieRingComplication: View {
    let entry: CalorieEntry

    var body: some View {
        let progress = 1.0 - (Double(entry.caloriesRemaining) / Double(max(entry.calorieTarget, 1)))

        ZStack {
            AccessoryWidgetBackground()
            ZStack {
                Circle()
                    .stroke(.orange.opacity(0.3), lineWidth: 4)
                Circle()
                    .trim(from: 0, to: min(progress, 1.0))
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
// struct RecompWidgetBundle: WidgetBundle {
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
        StaticConfiguration(kind: kind, provider: RecompComplicationProvider()) { entry in
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
        StaticConfiguration(kind: kind, provider: RecompComplicationProvider()) { entry in
            MacroBarComplication(entry: entry)
        }
        .configurationDisplayName("Macros")
        .description("Macro progress bars")
        .supportedFamilies([.accessoryRectangular])
    }
}
