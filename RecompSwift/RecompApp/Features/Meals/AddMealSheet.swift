import SwiftUI
import SwiftData
import PhotosUI
import RefactorKit

struct AddMealSheet: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(\.syncEngine) private var syncEngine
    @State private var mealService = MealService()

    let date: String

    @State private var name = ""
    @State private var mealType: MealType = .lunch
    @State private var calories = 0
    @State private var protein: Double = 0
    @State private var carbs: Double = 0
    @State private var fat: Double = 0
    @State private var notes = ""
    @State private var inputMode: InputMode = .manual
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var analysisResults: [SuggestedMeal] = []
    @State private var isAnalyzing = false
    @State private var recipeURL = ""

    enum InputMode: String, CaseIterable {
        case manual = "Manual"
        case photo = "Photo"
        case voice = "Voice"
        case recipe = "Recipe URL"
        case suggest = "AI Suggest"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Input Method") {
                    Picker("Method", selection: $inputMode) {
                        ForEach(InputMode.allCases, id: \.self) {
                            Text($0.rawValue)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                switch inputMode {
                case .manual:
                    manualInputSection
                case .photo:
                    photoInputSection
                case .voice:
                    voiceInputSection
                case .recipe:
                    recipeInputSection
                case .suggest:
                    suggestSection
                }

                if !analysisResults.isEmpty {
                    Section("Results") {
                        ForEach(analysisResults) { suggestion in
                            Button {
                                applySuggestion(suggestion)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(suggestion.name).font(.body)
                                    Text("\(suggestion.macros.calories) cal · P:\(Int(suggestion.macros.protein))g C:\(Int(suggestion.macros.carbs))g F:\(Int(suggestion.macros.fat))g")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                macroInputSection

                Section("Notes") {
                    TextField("Optional notes", text: $notes, axis: .vertical)
                        .lineLimit(3)
                }
            }
            .navigationTitle("Add Meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveMeal() }
                        .disabled(name.isEmpty)
                }
            }
        }
    }

    private var manualInputSection: some View {
        Section("Meal Info") {
            TextField("Meal name", text: $name)
            Picker("Type", selection: $mealType) {
                ForEach(MealType.allCases) { type in
                    Text(type.rawValue.capitalized).tag(type)
                }
            }
        }
    }

    private var macroInputSection: some View {
        Section("Macros") {
            Stepper("Calories: \(calories)", value: $calories, in: 0...5000, step: 25)
            HStack {
                Text("Protein (g)")
                Spacer()
                TextField("", value: $protein, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
            }
            HStack {
                Text("Carbs (g)")
                Spacer()
                TextField("", value: $carbs, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
            }
            HStack {
                Text("Fat (g)")
                Spacer()
                TextField("", value: $fat, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
            }
        }
    }

    private var photoInputSection: some View {
        Section("Photo Analysis") {
            PhotosPicker("Select Photo", selection: $selectedPhoto, matching: .images)
                .onChange(of: selectedPhoto) { _, newValue in
                    guard let item = newValue else { return }
                    Task {
                        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                        isAnalyzing = true
                        do {
                            analysisResults = try await mealService.analyzePhoto(imageData: data)
                        } catch {
                            analysisResults = []
                        }
                        isAnalyzing = false
                    }
                }

            if isAnalyzing {
                HStack {
                    ProgressView()
                    Text("Analyzing photo...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var voiceInputSection: some View {
        Section("Voice Logging") {
            Label("Tap to record your meal", systemImage: "mic.fill")
                .foregroundStyle(.blue)
            Text("Say something like \"I had a grilled chicken salad with olive oil dressing for lunch\"")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var recipeInputSection: some View {
        Section("Recipe URL") {
            TextField("Paste recipe URL", text: $recipeURL)
                .keyboardType(.URL)
                .autocapitalization(.none)

            Button("Parse Recipe") {
                Task {
                    isAnalyzing = true
                    do {
                        let result = try await mealService.parseRecipeUrl(recipeURL)
                        name = result.name
                        calories = result.macros.calories
                        protein = result.macros.protein
                        carbs = result.macros.carbs
                        fat = result.macros.fat
                    } catch {}
                    isAnalyzing = false
                }
            }
            .disabled(recipeURL.isEmpty)
        }
    }

    private var suggestSection: some View {
        Section("AI Suggestions") {
            Button {
                Task {
                    isAnalyzing = true
                    do {
                        try await mealService.fetchSuggestions(
                            profile: UserProfileDTO(
                                id: "", name: "", age: 30, weight: 70, height: 170,
                                gender: "male", fitnessLevel: "beginner", goal: "maintain"
                            ),
                            date: date
                        )
                        analysisResults = mealService.suggestions
                    } catch {}
                    isAnalyzing = false
                }
            } label: {
                Label("Get Suggestions", systemImage: "sparkles")
            }

            if isAnalyzing {
                ProgressView("Thinking...")
            }
        }
    }

    private func applySuggestion(_ suggestion: SuggestedMeal) {
        name = suggestion.name
        calories = suggestion.macros.calories
        protein = suggestion.macros.protein
        carbs = suggestion.macros.carbs
        fat = suggestion.macros.fat
        if let mt = suggestion.mealType, let type = MealType(rawValue: mt) {
            mealType = type
        }
    }

    private func saveMeal() {
        let meal = MealEntry(
            date: date,
            mealType: mealType,
            name: name,
            macros: Macros(calories: calories, protein: protein, carbs: carbs, fat: fat),
            notes: notes.isEmpty ? nil : notes
        )
        context.insert(meal)
        try? context.save()
        Task { await syncEngine?.markDirty() }
        dismiss()
    }
}
