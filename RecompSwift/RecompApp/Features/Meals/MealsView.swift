import SwiftUI
import SwiftData
import RefactorKit

struct MealsView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @State private var mealService = MealService()
    @State private var selectedDate = Date.now
    @State private var showAddMeal = false
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

                Picker("View", selection: $selectedTab) {
                    Text("Meals").tag(0)
                    Text("Pantry").tag(1)
                    Text("Meal Prep").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.bottom, 8)

                switch selectedTab {
                case 0: mealListSection
                case 1: PantryView()
                case 2: MealPrepView()
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
                AddMealSheet(date: DateHelpers.dateString(from: selectedDate))
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
        return HStack(spacing: 16) {
            macroPill("Cal", value: consumed.calories, color: .appWarm)
            macroPill("P", value: Int(consumed.protein), color: .appAccent)
            macroPill("C", value: Int(consumed.carbs), color: .appSage)
            macroPill("F", value: Int(consumed.fat), color: .appTerracotta)
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    private func macroPill(_ label: String, value: Int, color: Color) -> some View {
        let spokenName: String = {
            switch label {
            case "Cal": return "Calories"
            case "P": return "Protein"
            case "C": return "Carbs"
            case "F": return "Fat"
            default: return label
            }
        }()
        return HStack(spacing: 4) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(color)
            Text("\(value)")
                .font(.caption.weight(.medium))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(color.opacity(0.1), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenName)
        .accessibilityValue("\(value)")
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
                                try? context.save()
                                Task { await syncEngine?.markDirty() }
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
