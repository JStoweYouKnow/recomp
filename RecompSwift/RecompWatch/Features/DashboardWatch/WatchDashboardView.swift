import SwiftUI
import SwiftData
import RefactorKit

/// Mirrors iOS `DashboardView` calorie budget. Uses a phone-pushed snapshot when the
/// local App Group store is behind, otherwise SwiftData (same targets/consumed logic as iPhone).
struct WatchDashboardView: View {
    @Environment(\.modelContext) private var context

    @Query(sort: \MealEntry.loggedAt, order: .reverse)
    private var allMeals: [MealEntry]

    @State private var refreshToken = 0

    private var streakCount: Int {
        DateHelpers.streakLength(dates: Array(Set(allMeals.map(\.date))))
    }

    var body: some View {
        let metrics = WatchDashboardMetricsResolver.resolve(context: context)
        let consumed = metrics.consumed
        let targets = metrics.targets
        let adjustedCalorieTarget = metrics.adjustedCalorieTarget

        ScrollView {
            VStack(spacing: 12) {
                Text("Refactor")
                    .font(.headline)

                calorieRing(consumed: consumed.calories, target: adjustedCalorieTarget)

                HStack(spacing: 10) {
                    miniRing(current: consumed.protein, target: targets.protein, color: .red, label: "P")
                    miniRing(current: consumed.carbs, target: targets.carbs, color: .green, label: "C")
                    miniRing(current: consumed.fat, target: targets.fat, color: .orange, label: "F")
                }

                if streakCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "flame.fill")
                            .foregroundStyle(.orange)
                            .font(.caption2)
                            .accessibilityHidden(true)
                        Text("\(streakCount) day streak")
                            .font(.caption2)
                    }
                }
            }
            .padding()
        }
        .id(refreshToken)
        .onReceive(NotificationCenter.default.publisher(for: .recompWatchDashboardSnapshotUpdated)) { _ in
            refreshToken &+= 1
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompWatchShouldRefresh)) { _ in
            refreshToken &+= 1
        }
    }

    private func calorieRing(consumed: Int, target: Int) -> some View {
        let remaining = max(target - consumed, 0)
        let progress = min(Double(consumed) / Double(max(target, 1)), 1.0)

        return ZStack {
            Circle()
                .stroke(.orange.opacity(0.2), lineWidth: 8)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(.orange, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(remaining)")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                Text("cal left")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 100, height: 100)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Calories remaining")
        .accessibilityValue("\(remaining) of \(target) calories, \(consumed) consumed")
    }

    private func miniRing(current: Double, target: Double, color: Color, label: String) -> some View {
        let progress = min(current / max(target, 1), 1.0)
        let spokenName: String = {
            switch label {
            case "P": return "Protein"
            case "C": return "Carbs"
            case "F": return "Fat"
            default: return label
            }
        }()
        return ZStack {
            Circle()
                .stroke(color.opacity(0.2), lineWidth: 4)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(color)
        }
        .frame(width: 36, height: 36)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenName)
        .accessibilityValue("\(Int(current)) of \(Int(target)) grams")
    }
}
