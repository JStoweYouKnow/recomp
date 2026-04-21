import SwiftUI
import SwiftData
import RefactorKit

/// Mirrors iOS `DashboardView` calorie budget: today’s meals from the shared SwiftData store
/// and targets from the current `FitnessPlan` (same defaults when no plan).
struct WatchDashboardView: View {
    @Query(sort: \MealEntry.loggedAt, order: .reverse)
    private var allMeals: [MealEntry]

    @Query(sort: \FitnessPlan.createdAt, order: .reverse)
    private var allPlans: [FitnessPlan]

    @Query
    private var activityLogEntries: [ActivityLogEntry]

    private var todayKey: String { DateHelpers.todayString() }

    private var consumed: Macros {
        allMeals
            .filter { $0.date == todayKey }
            .reduce(Macros.zero) { $0.adding($1.macros) }
    }

    private var targets: Macros {
        allPlans.first?.dietPlan.dailyTargets ?? Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
    }

    private var streakCount: Int {
        DateHelpers.streakLength(dates: Array(Set(allMeals.map(\.date))))
    }

    var body: some View {
        let c = consumed
        let t = targets
        let activityAdj = activityLogEntries
            .filter { $0.date == todayKey }
            .reduce(0) { $0 + $1.calorieAdjustment }
        let adjustedCalorieTarget = t.calories + activityAdj

        ScrollView {
            VStack(spacing: 12) {
                Text("Refactor")
                    .font(.headline)

                calorieRing(consumed: c.calories, target: adjustedCalorieTarget)

                HStack(spacing: 10) {
                    miniRing(current: c.protein, target: t.protein, color: .red, label: "P")
                    miniRing(current: c.carbs, target: t.carbs, color: .green, label: "C")
                    miniRing(current: c.fat, target: t.fat, color: .orange, label: "F")
                }

                if streakCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "flame.fill")
                            .foregroundStyle(.orange)
                            .font(.caption2)
                        Text("\(streakCount) day streak")
                            .font(.caption2)
                    }
                }
            }
            .padding()
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
    }

    private func miniRing(current: Double, target: Double, color: Color, label: String) -> some View {
        let progress = min(current / max(target, 1), 1.0)
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
    }
}
