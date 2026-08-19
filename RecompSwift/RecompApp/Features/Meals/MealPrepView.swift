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
    @State private var newGroceryItem = ""
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
                        if plan.groceryList.isEmpty {
                            Button {
                                buildGroceryList(for: plan)
                            } label: {
                                Label("Build grocery list", systemImage: "cart")
                            }
                        }
                        ForEach(Array(plan.groceryList.enumerated()), id: \.element.item) { index, item in
                            Button {
                                toggleGroceryItem(in: plan, at: index)
                            } label: {
                                HStack {
                                    Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(item.checked ? Color.appSuccess : Color.secondary)
                                    Text(item.item)
                                        .strikethrough(item.checked)
                                        .foregroundStyle(item.checked ? .secondary : .primary)
                                    Spacer()
                                    Text(item.amount)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        .onDelete { offsets in
                            removeGroceryItems(in: plan, at: offsets)
                        }
                        HStack {
                            TextField("Add item…", text: $newGroceryItem)
                                .textInputAutocapitalization(.never)
                            Button("Add") {
                                addGroceryItem(to: plan)
                            }
                            .disabled(newGroceryItem.trimmingCharacters(in: .whitespaces).isEmpty)
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
                        .cardSurface(cornerRadius: 16)
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
            // Monday-based week start (matches web getWeekStart and Android).
            let cal = Calendar.current
            let weekday = cal.component(.weekday, from: .now)
            let daysToMonday = (weekday + 5) % 7
            let start = cal.date(byAdding: .day, value: -daysToMonday, to: .now) ?? .now
            let weekStart = DateHelpers.dateString(from: start)

            if replaceExisting {
                for p in plans { context.delete(p) }
            }

            let plan = MealPrepPlan(
                weekStart: weekStart,
                recipes: recipes,
                groceryList: GroceryListBuilder.build(from: recipes, pantryNames: pantry),
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

    /// Backfills the grocery list for plans generated before lists were populated.
    private func buildGroceryList(for plan: MealPrepPlan) {
        plan.groceryList = GroceryListBuilder.build(
            from: plan.recipes,
            pantryNames: pantryItems.map(\.name)
        )
        try? context.save()
        Task { await syncEngine?.markDirty() }
    }

    private func toggleGroceryItem(in plan: MealPrepPlan, at index: Int) {
        guard plan.groceryList.indices.contains(index) else { return }
        plan.groceryList[index].checked.toggle()
        try? context.save()
        Task { await syncEngine?.markDirty() }
    }

    private func addGroceryItem(to plan: MealPrepPlan) {
        let trimmed = newGroceryItem.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty, !plan.groceryList.contains(where: { $0.item == trimmed }) else {
            newGroceryItem = ""
            return
        }
        plan.groceryList.append(
            MealPrepPlan.GroceryItem(item: trimmed, amount: "", category: "custom", checked: false)
        )
        newGroceryItem = ""
        try? context.save()
        Task { await syncEngine?.markDirty() }
    }

    private func removeGroceryItems(in plan: MealPrepPlan, at offsets: IndexSet) {
        plan.groceryList.remove(atOffsets: offsets)
        try? context.save()
        Task { await syncEngine?.markDirty() }
    }
}
