import SwiftUI
import SwiftData
import RefactorKit

struct DailyQuestsCard: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \MealEntry.loggedAt, order: .reverse) private var allMeals: [MealEntry]
    @State private var planService = PlanService()
    @State private var waterLogged = false

    private var todaysMeals: [MealEntry] {
        let today = DateHelpers.todayString()
        return allMeals.filter { $0.date == today }
    }

    private var quests: [(String, Bool)] {
        let consumed = todaysMeals.reduce(Macros.zero) { $0.adding($1.macros) }
        let targets = planService.todaysTargets(context: context)
        let workoutDone = workoutCompletedToday

        return [
            ("Log 3 meals", todaysMeals.count >= 3),
            ("Hit protein target", consumed.protein >= targets.protein),
            ("Drink 2L water", waterLogged),
            ("Complete workout", workoutDone),
        ]
    }

    private var workoutCompletedToday: Bool {
        let todayKey = DateHelpers.todayString()
        guard let plan = planService.currentPlan(context: context),
              let idx = planService.todaysWorkoutPlanIndex(context: context),
              let day = planService.todaysWorkout(context: context)
        else { return false }
        return WorkoutService.shared.isWorkoutDayFullyComplete(day, dayKey: todayKey, planIndex: idx, planId: plan.id)
    }

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(quests.indices, id: \.self) { i in
                    HStack(spacing: 8) {
                        Image(systemName: quests[i].1 ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(quests[i].1 ? Color.appSuccess : Color.secondary)
                            .font(.caption)

                        Text(quests[i].0)
                            .font(.caption)
                            .strikethrough(quests[i].1)
                            .foregroundStyle(quests[i].1 ? .secondary : .primary)

                        if quests[i].0 == "Log 3 meals" {
                            Spacer()
                            Text("\(todaysMeals.count)/3")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        guard quests[i].0 == "Drink 2L water" else { return }
                        withAnimation { waterLogged.toggle() }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(quests[i].0 == "Drink 2L water" ? .isButton : [])
                    .accessibilityValue(quests[i].1 ? "Completed" : "Not completed")
                }
            }
        } label: {
            Label("Daily Quests", systemImage: "star")
                .font(.caption.weight(.medium))
        }
    }
}
