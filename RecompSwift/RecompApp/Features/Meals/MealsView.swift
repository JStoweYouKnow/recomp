import SwiftUI
import SwiftData
import RefactorKit

struct MealsView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @State private var planService = PlanService()
    @State private var selectedDate = Date.now
    @State private var showAddMeal = false
    @State private var addMealPrefill: MealRecommendation?
    @State private var recTab: RecommendationCategory = .meal
    @State private var selectedTab = 0
    @State private var mealEditToken: EditableMealToken?

    @Query(sort: \MealEntry.loggedAt, order: .reverse)
    private var allMeals: [MealEntry]

    private var mealsForDate: [MealEntry] {
        let dateStr = DateHelpers.dateString(from: selectedDate)
        return allMeals.filter { $0.date == dateStr }
    }

    private var mealDates: Set<String> {
        Set(allMeals.map(\.date))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                CalendarStripView(selectedDate: $selectedDate, dotDates: mealDates)
                    .padding(.vertical, 8)

                macroSummary

                if selectedTab == 0 {
                    memoryRecommendationsSection
                }

                Picker("View", selection: $selectedTab) {
                    Text("Meals").tag(0)
                    Text("Pantry").tag(1)
                    Text("Meal Prep").tag(2)
                    Text("Recipes").tag(3)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.bottom, 8)

                switch selectedTab {
                case 0: mealListSection
                case 1: PantryView()
                case 2: MealPrepView()
                case 3: SavedRecipesView()
                default: mealListSection
                }
            }
            .navigationTitle("Meals")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAddMeal = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .accessibilityLabel("Add meal")
                }
            }
            .sheet(isPresented: $showAddMeal) {
                AddMealSheet(
                    date: DateHelpers.dateString(from: selectedDate),
                    prefill: addMealPrefill
                )
            }
            .onChange(of: showAddMeal) { _, open in
                if !open { addMealPrefill = nil }
            }
            .sheet(item: $mealEditToken) { token in
                EditMealSheet(meal: token.meal)
            }
            .refreshable {
                guard let engine = syncEngine else { return }
                try? await engine.fetchAndApply()
            }
        }
    }

    private var macroSummary: some View {
        let consumed = mealsForDate.reduce(Macros.zero) { $0.adding($1.macros) }
        let targets = planService.targets(for: selectedDate, context: context)
        return MacroPillsView(consumed: consumed, target: targets)
            .padding(.horizontal)
            .padding(.bottom, 8)
    }

    private var memoryRecommendationsSection: some View {
        let consumed = mealsForDate.reduce(Macros.zero) { $0.adding($1.macros) }
        let targets = planService.targets(for: selectedDate, context: context)
        let result = MemoryMealRecommender.recommend(
            meals: allMeals,
            targets: targets,
            consumed: consumed
        )
        let items = recTab == .meal ? result.meals : result.snacks

        return Group {
            if !result.meals.isEmpty || !result.snacks.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Recommended for you")
                                .font(.subheadline.weight(.semibold))
                            Text("From your history · \(result.budget.calories) cal left")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Picker("Category", selection: $recTab) {
                            Text("Meals").tag(RecommendationCategory.meal)
                            Text("Snacks").tag(RecommendationCategory.snack)
                        }
                        .pickerStyle(.segmented)
                        .frame(maxWidth: 180)
                    }
                    .padding(.horizontal)

                    if items.isEmpty {
                        Text(recTab == .snack
                             ? "Log a few snacks to get picks here."
                             : "No meal matches right now.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(items) { item in
                                    Button {
                                        addMealPrefill = item
                                        showAddMeal = true
                                    } label: {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(item.name)
                                                .font(.subheadline.weight(.medium))
                                                .lineLimit(2)
                                                .multilineTextAlignment(.leading)
                                            Text("\(item.macros.calories) cal · P \(Int(item.macros.protein))g")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                            Text(item.fitReason)
                                                .font(.caption2)
                                                .foregroundStyle(.tertiary)
                                                .lineLimit(1)
                                        }
                                        .frame(width: 150, alignment: .leading)
                                        .padding(10)
                                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                }
                .padding(.vertical, 8)
            }
        }
    }

    private var mealListSection: some View {
        Group {
            if mealsForDate.isEmpty {
                EmptyStateView(
                    icon: "fork.knife",
                    title: "No Meals",
                    subtitle: "Tap + to log your first meal for this day",
                    actionTitle: "Add Meal"
                ) {
                    showAddMeal = true
                }
            } else {
                List {
                    ForEach(mealsForDate, id: \.syncKey) { meal in
                        Button {
                            mealEditToken = EditableMealToken(meal)
                        } label: {
                            MealRow(meal: meal)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                context.delete(meal)
                                do {
                                    try context.save()
                                    Haptics.impact(.rigid)
                                    MealChangeNotifier.postLocalMealsChanged()
                                    ToastCenter.show("Meal deleted", type: .info)
                                    Task {
                                        await syncEngine?.markDirty()
                                        _ = await syncEngine?.syncNow()
                                    }
                                } catch {
                                    // Deletion failed locally; meal row remains.
                                }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollDismissesKeyboard(.interactively)
            }
        }
    }
}

struct MealRow: View {
    let meal: MealEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(meal.mealType.rawValue.capitalized)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.appAccent.opacity(0.1), in: Capsule())

                Spacer()

                Text("\(meal.macros.calories) cal")
                    .font(.subheadline.weight(.medium))

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }

            Text(meal.name)
                .font(.body)
                .multilineTextAlignment(.leading)

            HStack(spacing: 12) {
                Text("P: \(Int(meal.macros.protein))g")
                Text("C: \(Int(meal.macros.carbs))g")
                Text("F: \(Int(meal.macros.fat))g")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let notes = meal.notes, !notes.isEmpty {
                Text(notes)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
