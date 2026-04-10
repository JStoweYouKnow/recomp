import SwiftUI
import SwiftData

// Uses MealEntry, Macros, MealType, DateHelpers from RecompKit

struct QuickMealLogView: View {
    @Environment(\.modelContext) private var context
    @State private var showDictation = false
    @State private var loggedMessage: String?

    private let recentMeals = [
        ("Chicken & Rice", Macros(calories: 450, protein: 40, carbs: 50, fat: 8)),
        ("Protein Shake", Macros(calories: 200, protein: 30, carbs: 10, fat: 5)),
        ("Greek Yogurt", Macros(calories: 150, protein: 15, carbs: 12, fat: 4)),
        ("Salad Bowl", Macros(calories: 350, protein: 25, carbs: 30, fat: 12)),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Label("Quick Log", systemImage: "fork.knife")
                    .font(.headline)

                Button {
                    showDictation = true
                } label: {
                    Label("Voice Log", systemImage: "mic.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)

                Divider()

                Text("Recent Meals")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                ForEach(recentMeals, id: \.0) { name, macros in
                    Button {
                        logMeal(name: name, macros: macros)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(name)
                                .font(.caption)
                            Text("\(macros.calories) cal")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.bordered)
                }

                if let msg = loggedMessage {
                    Text(msg)
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
            }
            .padding()
        }
    }

    private func logMeal(name: String, macros: Macros) {
        let meal = MealEntry(
            date: DateHelpers.todayString(),
            mealType: .snack,
            name: name,
            macros: macros
        )
        context.insert(meal)
        loggedMessage = "\(name) logged!"

        Task {
            try? await Task.sleep(for: .seconds(2))
            loggedMessage = nil
        }
    }
}
