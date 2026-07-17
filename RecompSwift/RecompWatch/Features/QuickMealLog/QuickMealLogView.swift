import SwiftUI
import SwiftData
import RefactorKit

struct QuickMealLogView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @State private var showDictation = false
    @State private var loggedMessage: String?

    @Query(sort: \MealEntry.loggedAt, order: .reverse)
    private var allMeals: [MealEntry]

    /// Recent distinct meal names from the shared store (same source as iOS Meals).
    private var recentQuickMeals: [QuickMealRow] {
        var seen = Set<String>()
        var rows: [QuickMealRow] = []
        for meal in allMeals {
            let key = meal.name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty, !seen.contains(key) else { continue }
            seen.insert(key)
            rows.append(QuickMealRow(id: meal.id, name: meal.name, macros: meal.macros))
            if rows.count >= 8 { break }
        }
        return rows
    }

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

                Text("Recent meals")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if recentQuickMeals.isEmpty {
                    Text("Log meals on iPhone or here to build quick picks.")
                        .font(.caption2)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(recentQuickMeals) { row in
                        Button {
                            logMeal(name: row.name, macros: row.macros)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.name)
                                    .font(.caption)
                                Text("\(row.macros.calories) cal · P\(Int(row.macros.protein)) C\(Int(row.macros.carbs)) F\(Int(row.macros.fat))")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                    }
                }

                if let msg = loggedMessage {
                    Text(msg)
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
            }
            .padding()
        }
        .sheet(isPresented: $showDictation) {
            WatchVoiceMealLogSheet(isPresented: $showDictation)
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
        try? context.save()
        Task {
            await syncEngine?.markDirty()
            await syncEngine?.syncNow()
        }
        loggedMessage = "\(name) logged!"

        Task {
            try? await Task.sleep(for: .seconds(2))
            loggedMessage = nil
        }
    }
}

private struct QuickMealRow: Identifiable {
    let id: String
    let name: String
    let macros: Macros
}
