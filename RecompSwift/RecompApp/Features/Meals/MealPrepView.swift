import SwiftUI
import SwiftData

struct MealPrepView: View {
    @Query(sort: \MealPrepPlan.createdAt, order: .reverse)
    private var plans: [MealPrepPlan]

    @State private var isGenerating = false

    var body: some View {
        Group {
            if let plan = plans.first {
                List {
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

                    Section("Grocery List") {
                        ForEach(plan.groceryList, id: \.item) { item in
                            HStack {
                                Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(item.checked ? .green : .secondary)
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
                EmptyStateView(
                    icon: "takeoutbag.and.cup.and.straw",
                    title: "No Meal Prep Plan",
                    subtitle: "Generate a weekly meal prep plan with grocery list",
                    actionTitle: "Generate Plan"
                ) {
                    isGenerating = true
                }
            }
        }
    }
}
