import SwiftUI
import SwiftData
import RefactorKit

struct MealPrepView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Environment(AuthService.self) private var auth

    @Query(sort: \MealPrepPlan.createdAt, order: .reverse) private var plans: [MealPrepPlan]
    @Query(sort: \PantryItem.name) private var pantryItems: [PantryItem]

    @State private var mealService = MealService()
    @State private var planService = PlanService()
    @State private var isGenerating = false
    @State private var errorText: String?
    @State private var showError = false
    @State private var prefsNote = ""
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false
    @State private var showAIConsent = false
    @State private var pendingReplace = false

    var body: some View {
        Group {
            if let plan = plans.first {
                List {
                    Section("Optional preferences") {
                        TextField("e.g. high protein, no seafood", text: $prefsNote, axis: .vertical)
                            .lineLimit(2...4)
                    }
                    Section {
                        Button {
                            if aiConsentGiven {
                                Task { await generatePlan(replaceExisting: true) }
                            } else {
                                pendingReplace = true
                                showAIConsent = true
                            }
                        } label: {
                            if isGenerating {
                                ProgressView()
                            } else {
                                Label("Regenerate plan", systemImage: "arrow.clockwise")
                            }
                        }
                        .disabled(isGenerating)
                    }

                    Section("Recipes (\(plan.recipes.count))") {
                        ForEach(plan.recipes) { recipe in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(recipe.name).font(.body.weight(.medium))
                                Text("\(recipe.servings) servings · \(recipe.prepTime + recipe.cookTime) min")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text("P:\(Int(recipe.macrosPerServing.protein))g C:\(Int(recipe.macrosPerServing.carbs))g F:\(Int(recipe.macrosPerServing.fat))g per serving")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Section("Batch prep") {
                        ForEach(plan.batchInstructions, id: \.self) { line in
                            Text(line)
                                .font(.caption)
                        }
                    }

                    Section("Grocery List") {
                        ForEach(plan.groceryList, id: \.item) { item in
                            HStack {
                                Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(item.checked ? Color.appSuccess : Color.secondary)
                                Text(item.item)
                                Spacer()
                                Text(item.amount)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            } else {
                VStack(spacing: 16) {
                    TextField("Optional preferences for the plan…", text: $prefsNote, axis: .vertical)
                        .lineLimit(2...4)
                        .padding(12)
                        .background(.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal)

                    EmptyStateView(
                        icon: "takeoutbag.and.cup.and.straw",
                        title: "No Meal Prep Plan",
                        subtitle: "Generate a weekly meal prep plan with grocery list",
                        actionTitle: "Generate Plan"
                    ) {
                        if aiConsentGiven {
                            Task { await generatePlan(replaceExisting: false) }
                        } else {
                            pendingReplace = false
                            showAIConsent = true
                        }
                    }
                }
            }
        }
        .overlay {
            if isGenerating {
                ZStack {
                    Color.black.opacity(0.15).ignoresSafeArea()
                    ProgressView("Generating…")
                        .padding(24)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
        .alert("Meal prep", isPresented: $showError) {
            Button("OK") { errorText = nil }
        } message: {
            Text(errorText ?? "")
        }
        .sheet(isPresented: $showAIConsent) {
            AIConsentView(
                onAccept: {
                    aiConsentGiven = true
                    showAIConsent = false
                    Task { await generatePlan(replaceExisting: pendingReplace) }
                },
                onDecline: { showAIConsent = false }
            )
        }
    }

    private func generatePlan(replaceExisting: Bool) async {
        isGenerating = true
        errorText = nil
        defer { isGenerating = false }

        let targets = planService.currentPlan(context: context)?.dietPlan.dailyTargets
            ?? Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
        let restrictions = auth.currentUser?.dietaryRestrictions ?? []
        let pantry = pantryItems.map(\.name)
        let note = prefsNote.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload = MealPrepGeneratePayload(
            dailyTargets: targets,
            dietaryRestrictions: restrictions,
            pantryItems: pantry,
            preferences: note.isEmpty ? nil : note
        )

        do {
            let response = try await mealService.generateMealPrepPlan(payload: payload)
            let recipes = response.toRecipes()
            let cal = Calendar.current
            let weekday = cal.component(.weekday, from: .now)
            let start = cal.date(byAdding: .day, value: -(weekday - 1), to: .now) ?? .now
            let weekStart = DateHelpers.dateString(from: start)

            if replaceExisting {
                for p in plans { context.delete(p) }
            }

            let plan = MealPrepPlan(
                weekStart: weekStart,
                recipes: recipes,
                groceryList: [],
                batchInstructions: response.batchInstructions,
                estimatedPrepTime: response.estimatedPrepTime
            )
            context.insert(plan)
            try context.save()
            await syncEngine?.markDirty()
        } catch {
            errorText = error.localizedDescription
            showError = true
        }
    }
}
