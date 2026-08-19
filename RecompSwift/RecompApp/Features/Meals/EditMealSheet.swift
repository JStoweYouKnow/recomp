import SwiftData
import SwiftUI
import RefactorKit

/// Token so `sheet(item:)` can hold a stable reference to the row being edited.
struct EditableMealToken: Identifiable {
    let id: ObjectIdentifier
    let meal: MealEntry

    init(_ meal: MealEntry) {
        self.meal = meal
        self.id = ObjectIdentifier(meal)
    }
}

struct EditMealSheet: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(\.syncEngine) private var syncEngine

    let meal: MealEntry

    @State private var pickedDate: Date
    @State private var mealType: MealType
    @State private var name: String
    @State private var calories: Int
    @State private var protein: Double
    @State private var carbs: Double
    @State private var fat: Double
    @State private var notes: String
    @State private var saveError: String?

    init(meal: MealEntry) {
        self.meal = meal
        _pickedDate = State(initialValue: DateHelpers.date(from: meal.date) ?? .now)
        _mealType = State(initialValue: meal.mealType)
        _name = State(initialValue: meal.name)
        _calories = State(initialValue: meal.macros.calories)
        _protein = State(initialValue: meal.macros.protein)
        _carbs = State(initialValue: meal.macros.carbs)
        _fat = State(initialValue: meal.macros.fat)
        _notes = State(initialValue: meal.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("When") {
                    DatePicker("Day", selection: $pickedDate, displayedComponents: .date)
                    Picker("Meal type", selection: $mealType) {
                        ForEach(MealType.allCases) { type in
                            Text(type.rawValue.capitalized).tag(type)
                        }
                    }
                }

                Section("Meal") {
                    TextField("Name", text: $name)
                }

                Section("Macros") {
                    HStack {
                        Text("Calories")
                        Spacer()
                        TextField("0", value: $calories, format: .number)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(minWidth: 72, alignment: .trailing)
                    }
                    HStack {
                        Text("Protein (g)")
                        Spacer()
                        TextField("0", value: $protein, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(minWidth: 72, alignment: .trailing)
                    }
                    HStack {
                        Text("Carbs (g)")
                        Spacer()
                        TextField("0", value: $carbs, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(minWidth: 72, alignment: .trailing)
                    }
                    HStack {
                        Text("Fat (g)")
                        Spacer()
                        TextField("0", value: $fat, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(minWidth: 72, alignment: .trailing)
                    }
                }

                Section("Notes") {
                    TextField("Optional notes", text: $notes, axis: .vertical)
                        .lineLimit(3)
                }
            }
            .navigationTitle("Edit Meal")
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .fontWeight(.semibold)
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { hideKeyboard() }
                }
            }
            .alert("Could not save", isPresented: Binding(
                get: { saveError != nil },
                set: { if !$0 { saveError = nil } }
            )) {
                Button("OK", role: .cancel) { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let newDate = DateHelpers.dateString(from: pickedDate)

        meal.date = newDate
        meal.syncKey = "\(newDate)#\(meal.id)"
        meal.mealType = mealType
        meal.name = trimmed
        meal.macros = Macros(calories: calories, protein: protein, carbs: carbs, fat: fat)
        let n = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        meal.notes = n.isEmpty ? nil : n
        meal.synced = false

        do {
            try context.save()
            MealChangeNotifier.postLocalMealsChanged()
            dismiss()
            Task {
                await syncEngine?.markDirty()
                _ = await syncEngine?.syncNow()
            }
        } catch {
            saveError = error.localizedDescription
        }
    }
}
