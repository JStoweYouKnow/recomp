import SwiftUI
import SwiftData
import PhotosUI
import RefactorKit

struct AddMealSheet: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(\.syncEngine) private var syncEngine
    @Environment(AuthService.self) private var auth
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
    @State private var selectedMenuPhoto: PhotosPickerItem?
    @State private var selectedReceiptPhoto: PhotosPickerItem?
    @State private var analysisResults: [SuggestedMeal] = []
    @State private var isAnalyzing = false
    @State private var recipeURL = ""
    @State private var foodSearchQuery = ""
    @State private var voiceTranscript = ""
    @State private var voiceParseError: String?
    @State private var speech = MealSpeechTranscription()

    enum InputMode: String, CaseIterable {
        case manual = "Manual"
        case photo = "Photo"
        case menu = "Menu scan"
        case receipt = "Receipt scan"
        case search = "Food search"
        case voice = "Voice"
        case recipe = "Recipe URL"
        case suggest = "AI Suggest"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Input Method") {
                    Picker("Method", selection: $inputMode) {
                        ForEach(InputMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                }

                switch inputMode {
                case .manual:
                    manualInputSection
                case .photo:
                    photoInputSection
                case .menu:
                    menuScanSection
                case .receipt:
                    receiptScanSection
                case .search:
                    foodSearchSection
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
            .onChange(of: inputMode) { _, mode in
                if mode != .voice {
                    speech.stopRecording()
                }
            }
            .onDisappear {
                speech.stopRecording()
            }
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

    private var menuScanSection: some View {
        Section("Menu scan") {
            PhotosPicker("Select menu photo", selection: $selectedMenuPhoto, matching: .images)
                .onChange(of: selectedMenuPhoto) { _, newValue in
                    guard let item = newValue else { return }
                    Task {
                        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                        isAnalyzing = true
                        do {
                            analysisResults = try await mealService.analyzeMenu(imageData: data)
                        } catch {
                            analysisResults = []
                        }
                        isAnalyzing = false
                    }
                }
            if isAnalyzing {
                ProgressView("Reading menu…")
            }
        }
    }

    private var receiptScanSection: some View {
        Section("Receipt scan") {
            PhotosPicker("Select receipt photo", selection: $selectedReceiptPhoto, matching: .images)
                .onChange(of: selectedReceiptPhoto) { _, newValue in
                    guard let item = newValue else { return }
                    Task {
                        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                        isAnalyzing = true
                        do {
                            analysisResults = try await mealService.analyzeReceipt(imageData: data)
                        } catch {
                            analysisResults = []
                        }
                        isAnalyzing = false
                    }
                }
            if isAnalyzing {
                ProgressView("Reading receipt…")
            }
        }
    }

    private var foodSearchSection: some View {
        Section("Food search") {
            TextField("e.g. grilled chicken breast 200g", text: $foodSearchQuery)
                .autocapitalization(.none)
            Button("Look up nutrition") {
                Task {
                    isAnalyzing = true
                    do {
                        let res = try await mealService.lookupNutrition(query: foodSearchQuery)
                        name = res.name
                        calories = res.macros.calories
                        protein = res.macros.protein
                        carbs = res.macros.carbs
                        fat = res.macros.fat
                    } catch {}
                    isAnalyzing = false
                }
            }
            .disabled(foodSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if isAnalyzing {
                ProgressView()
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
        Section("Voice logging") {
            Text("Use Listen for live transcription, type in the field, or use the keyboard microphone. Tap Parse to send the text to Refactor and list suggested meals below.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let voiceParseError {
                Text(voiceParseError)
                    .font(.caption)
                    .foregroundStyle(.red)
            } else if let err = speech.errorMessage {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            HStack(spacing: 12) {
                if speech.isRecording {
                    Button(role: .destructive) {
                        speech.stopRecording()
                    } label: {
                        Label("Stop", systemImage: "stop.fill")
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button {
                        Task { await speech.startRecording() }
                    } label: {
                        Label("Listen", systemImage: "mic.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isAnalyzing)
                }
            }

            TextField("e.g. grilled chicken salad with olive oil dressing", text: $voiceTranscript, axis: .vertical)
                .lineLimit(3...8)
                .textInputAutocapitalization(.sentences)
                .disabled(speech.isRecording)

            Button {
                Task { await parseVoiceTranscript() }
            } label: {
                Label("Parse meal", systemImage: "text.magnifyingglass")
            }
            .disabled(voiceTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isAnalyzing)

            if isAnalyzing && inputMode == .voice {
                ProgressView("Parsing…")
            }
        }
        .onChange(of: speech.transcript) { _, newValue in
            guard speech.isRecording else { return }
            voiceTranscript = newValue
        }
        .onChange(of: speech.isRecording) { wasRecording, isRecording in
            if wasRecording, !isRecording, !speech.transcript.isEmpty {
                voiceTranscript = speech.transcript
            }
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
                    guard let profile = auth.currentUser else { return }
                    isAnalyzing = true
                    do {
                        try await mealService.fetchSuggestions(
                            profile: profile.toDTO(),
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

    private func parseVoiceTranscript() async {
        voiceParseError = nil
        isAnalyzing = true
        defer { isAnalyzing = false }
        do {
            let meals = try await mealService.parseVoiceMeals(transcript: voiceTranscript)
            analysisResults = meals
            if meals.isEmpty {
                voiceParseError = "No meals returned. Try adding more detail (food names and amounts)."
            }
        } catch {
            analysisResults = []
            voiceParseError = error.localizedDescription
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
