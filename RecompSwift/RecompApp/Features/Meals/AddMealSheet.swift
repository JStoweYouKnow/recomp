import SwiftUI
import SwiftData
import PhotosUI
import RefactorKit

struct AddMealSheet: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(\.syncEngine) private var syncEngine
    @Environment(AuthService.self) private var auth
    @State private var vm = AddMealViewModel()
    @State private var planService = PlanService()

    @Query(sort: \MealEntry.date, order: .reverse) private var allMeals: [MealEntry]

    let date: String
    var prefill: MealRecommendation? = nil

    @State private var name = ""
    @State private var mealType: MealType = .lunch
    @State private var calories = 0
    @State private var protein: Double = 0
    @State private var carbs: Double = 0
    @State private var fat: Double = 0
    @State private var notes = ""
    @State private var servings: Double = 1
    @State private var inputMode: InputMode = .manual
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var selectedMenuPhoto: PhotosPickerItem?
    @State private var selectedReceiptPhoto: PhotosPickerItem?
    @State private var recipeURL = ""
    @State private var foodSearchQuery = ""
    @State private var barcodeQuery = ""
    @State private var barcodeError: String?
    @State private var isLookingUpBarcode = false
    @State private var showScanner = false
    @State private var voiceTranscript = ""
    @State private var speech = MealSpeechTranscription()
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false
    @State private var showAIConsent = false
    @State private var pendingAIAction: (() -> Void)?
    @State private var saveError: String?

    enum InputMode: String, CaseIterable {
        case manual = "Manual"
        case photo = "Photo"
        case menu = "Menu scan"
        case receipt = "Receipt scan"
        case barcode = "Barcode"
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

                Section("Meal") {
                    TextField("Meal name", text: $name)
                    Picker("Type", selection: $mealType) {
                        ForEach(MealType.allCases) { type in
                            Text(type.rawValue.capitalized).tag(type)
                        }
                    }
                }

                switch inputMode {
                case .manual:
                    autofillSuggestionsSection
                case .photo:
                    photoInputSection
                case .menu:
                    menuScanSection
                case .receipt:
                    receiptScanSection
                case .barcode:
                    barcodeSection
                case .search:
                    foodSearchSection
                case .voice:
                    voiceInputSection
                case .recipe:
                    recipeInputSection
                case .suggest:
                    suggestSection
                }

                if !vm.analysisResults.isEmpty {
                    Section("Results") {
                        ForEach(vm.analysisResults) { suggestion in
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
            .onAppear {
                if let p = prefill {
                    name = p.name
                    mealType = p.mealType
                    calories = p.macros.calories
                    protein = p.macros.protein
                    carbs = p.macros.carbs
                    fat = p.macros.fat
                }
            }
            .interactiveDismissDisabled(showScanner)
            .onChange(of: inputMode) { _, mode in
                if mode != .voice {
                    speech.stopRecording()
                }
            }
            .onDisappear {
                speech.stopRecording()
            }
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveMeal() }
                        .disabled(name.isEmpty)
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
            .sheet(isPresented: $showAIConsent) {
                AIConsentView(
                    onAccept: {
                        aiConsentGiven = true
                        showAIConsent = false
                        pendingAIAction?()
                        pendingAIAction = nil
                    },
                    onDecline: {
                        showAIConsent = false
                        pendingAIAction = nil
                    }
                )
            }
            .fullScreenCover(isPresented: $showScanner) {
                NavigationStack {
                    BarcodeScannerView { code in
                        showScanner = false
                        Task { await lookupBarcode(code) }
                    }
                    .ignoresSafeArea()
                    .navigationTitle("Scan Barcode")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showScanner = false }
                        }
                    }
                }
            }
        }
    }

    private func runWithConsent(_ action: @escaping () -> Void) {
        if aiConsentGiven {
            action()
        } else {
            pendingAIAction = action
            showAIConsent = true
        }
    }

    private var nameSuggestions: [MealEntry] {
        guard name.count >= 2 else { return [] }
        var seen = Set<String>()
        return allMeals.filter {
            $0.name.localizedCaseInsensitiveContains(name) && seen.insert($0.name.lowercased()).inserted
        }.prefix(5).map { $0 }
    }

    @ViewBuilder
    private var autofillSuggestionsSection: some View {
        if inputMode == .manual && !nameSuggestions.isEmpty {
            Section("Recent matches") {
                ForEach(nameSuggestions) { entry in
                    Button {
                        name = entry.name
                        calories = entry.macros.calories
                        protein = entry.macros.protein
                        carbs = entry.macros.carbs
                        fat = entry.macros.fat
                        mealType = entry.mealType
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.name)
                                .foregroundStyle(.primary)
                            Text("\(entry.macros.calories) cal · P:\(Int(entry.macros.protein))g C:\(Int(entry.macros.carbs))g F:\(Int(entry.macros.fat))g")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private var macroInputSection: some View {
        Section("Macros") {
            HStack {
                Text("Servings")
                Spacer()
                Stepper(value: $servings, in: 0.5...20, step: 0.5) {
                    Text(servings.truncatingRemainder(dividingBy: 1) == 0
                         ? "\(Int(servings))"
                         : String(format: "%.1f", servings))
                        .frame(minWidth: 32, alignment: .trailing)
                }
            }
            HStack {
                Text(servings == 1 ? "Calories" : "Calories / serving")
                Spacer()
                TextField("0", value: $calories, format: .number)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
            }
            HStack {
                Text(servings == 1 ? "Protein (g)" : "Protein / serving")
                Spacer()
                TextField("0", value: $protein, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
            }
            HStack {
                Text(servings == 1 ? "Carbs (g)" : "Carbs / serving")
                Spacer()
                TextField("0", value: $carbs, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
            }
            HStack {
                Text(servings == 1 ? "Fat (g)" : "Fat / serving")
                Spacer()
                TextField("0", value: $fat, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
            }
            if servings != 1 {
                let totalCal = Int((Double(calories) * servings).rounded())
                let totalP = Int((protein * servings).rounded())
                let totalC = Int((carbs * servings).rounded())
                let totalF = Int((fat * servings).rounded())
                HStack {
                    Text("Total")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(totalCal) cal · P:\(totalP)g C:\(totalC)g F:\(totalF)g")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var menuScanSection: some View {
        Section("Menu scan") {
            PhotosPicker("Select menu photo", selection: $selectedMenuPhoto, matching: .images)
                .onChange(of: selectedMenuPhoto) { _, newValue in
                    guard let item = newValue else { return }
                    vm.menuScanError = nil
                    runWithConsent {
                        Task {
                            guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                            await vm.analyzeMenu(data: data)
                        }
                    }
                }
            if vm.isAnalyzing {
                ProgressView("Reading menu…")
            }
            if let err = vm.menuScanError {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        }
    }

    private var receiptScanSection: some View {
        Section("Receipt scan") {
            PhotosPicker("Select receipt photo", selection: $selectedReceiptPhoto, matching: .images)
                .onChange(of: selectedReceiptPhoto) { _, newValue in
                    guard let item = newValue else { return }
                    vm.receiptScanError = nil
                    runWithConsent {
                        Task {
                            guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                            await vm.analyzeReceipt(data: data)
                        }
                    }
                }
            if vm.isAnalyzing {
                ProgressView("Reading receipt…")
            }
            if let err = vm.receiptScanError {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        }
    }

    private var barcodeSection: some View {
        Section("Barcode") {
            if BarcodeScannerView.isSupported {
                Button {
                    barcodeError = nil
                    Task {
                        if await BarcodeScannerView.requestCameraAccess() {
                            showScanner = true
                        } else {
                            barcodeError = "Camera access is required to scan barcodes. Enable it in Settings."
                        }
                    }
                } label: {
                    Label("Scan barcode", systemImage: "barcode.viewfinder")
                }
            }

            HStack {
                TextField("Or enter barcode number", text: $barcodeQuery)
                    .keyboardType(.numberPad)
                Button("Look up") {
                    Task { await lookupBarcode(barcodeQuery) }
                }
                .disabled(barcodeQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLookingUpBarcode)
            }

            if isLookingUpBarcode {
                ProgressView("Looking up product…")
            }
            if let barcodeError {
                Text(barcodeError).font(.caption).foregroundStyle(.red)
            }
            Text("Values are per 100 g — adjust servings below to match your portion.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func lookupBarcode(_ code: String) async {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        barcodeError = nil
        isLookingUpBarcode = true
        defer { isLookingUpBarcode = false }
        if let product = await OpenFoodFactsClient.lookup(barcode: trimmed) {
            name = product.name
            calories = product.macrosPer100g.calories
            protein = product.macrosPer100g.protein
            carbs = product.macrosPer100g.carbs
            fat = product.macrosPer100g.fat
            barcodeQuery = trimmed
        } else {
            barcodeError = "No nutrition found for that barcode. Try Food search or enter it manually."
        }
    }

    private var foodSearchSection: some View {
        Section("Food search") {
            TextField("e.g. grilled chicken breast 200g", text: $foodSearchQuery)
                .autocapitalization(.none)
            Button("Look up nutrition") {
                vm.foodSearchError = nil
                Task {
                    if let res = await vm.lookupNutrition(query: foodSearchQuery) {
                        name = res.name
                        calories = res.macros.calories
                        protein = res.macros.protein
                        carbs = res.macros.carbs
                        fat = res.macros.fat
                    }
                }
            }
            .disabled(foodSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if vm.isAnalyzing {
                ProgressView()
            }
            if let err = vm.foodSearchError {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        }
    }

    private var photoInputSection: some View {
        Section("Photo Analysis") {
            PhotosPicker("Select Photo", selection: $selectedPhoto, matching: .images)
                .onChange(of: selectedPhoto) { _, newValue in
                    guard let item = newValue else { return }
                    runWithConsent {
                        Task {
                            guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                            await vm.analyzePhoto(data: data)
                        }
                    }
                }

            if vm.isAnalyzing {
                HStack {
                    ProgressView()
                    Text("Analyzing photo...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let err = vm.photoParseError {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        }
    }

    private var voiceInputSection: some View {
        Section("Voice logging") {
            Text("Use Listen for live transcription, type in the field, or use the keyboard microphone. Tap Parse to send the text to Refactor and list suggested meals below.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let voiceParseError = vm.voiceParseError {
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
                    .disabled(vm.isAnalyzing)
                }
            }

            TextField("e.g. grilled chicken salad with olive oil dressing", text: $voiceTranscript, axis: .vertical)
                .lineLimit(3...8)
                .textInputAutocapitalization(.sentences)
                .disabled(speech.isRecording)

            Button {
                runWithConsent { Task { await vm.parseVoiceTranscript(voiceTranscript) } }
            } label: {
                Label("Parse meal", systemImage: "text.magnifyingglass")
            }
            .disabled(voiceTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isAnalyzing)

            if vm.isAnalyzing && inputMode == .voice {
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
                    if let result = await vm.parseRecipe(url: recipeURL) {
                        name = result.name
                        calories = result.macros.calories
                        protein = result.macros.protein
                        carbs = result.macros.carbs
                        fat = result.macros.fat
                    }
                }
            }
            .disabled(recipeURL.isEmpty || vm.isAnalyzing)

            if vm.isAnalyzing && inputMode == .recipe {
                ProgressView("Parsing recipe…")
            }

            if let err = vm.recipeParseError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private var suggestSection: some View {
        Section("AI Suggestions") {
            Button {
                runWithConsent {
                    vm.suggestError = nil
                    Task {
                        guard let profile = auth.currentUser else { return }
                        await vm.fetchSuggestions(profile: profile.toDTO(), date: date)
                    }
                }
            } label: {
                Label("Get Suggestions", systemImage: "sparkles")
            }

            if vm.isAnalyzing {
                ProgressView("Thinking...")
            }
            if let err = vm.suggestError {
                Text(err).font(.caption).foregroundStyle(.red)
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
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let meal = MealEntry(
            date: date,
            mealType: mealType,
            name: trimmed,
            macros: Macros(
                calories: Int((Double(calories) * servings).rounded()),
                protein: (protein * servings * 10).rounded() / 10,
                carbs: (carbs * servings * 10).rounded() / 10,
                fat: (fat * servings * 10).rounded() / 10
            ),
            notes: notes.isEmpty ? nil : notes,
            synced: false
        )
        let crossedProteinGoal = mealCrossesProteinGoal(adding: meal.macros.protein)

        context.insert(meal)
        do {
            try context.save()
            MealChangeNotifier.postLocalMealsChanged()
            HealthKitWriter.saveMeal(name: meal.name, macros: meal.macros, date: DateHelpers.date(from: date) ?? .now)
            if crossedProteinGoal {
                ToastCenter.celebrate()
                ToastCenter.show("Protein goal hit! 🎯", type: .success)
            } else {
                Haptics.success()
                ToastCenter.show("Meal logged", type: .success)
            }
            dismiss()
            Task {
                await syncEngine?.markDirty()
                _ = await syncEngine?.syncNow()
            }
        } catch {
            Haptics.error()
            saveError = error.localizedDescription
        }
    }

    /// True when today's logged protein was below target and this meal reaches or exceeds it.
    /// Only celebrates for meals logged on the current day.
    private func mealCrossesProteinGoal(adding addedProtein: Double) -> Bool {
        guard date == DateHelpers.todayString() else { return false }
        let target = planService.targets(for: .now, context: context).protein
        guard target > 0 else { return false }
        let priorProtein = allMeals
            .filter { $0.date == date }
            .reduce(0.0) { $0 + $1.macros.protein }
        return priorProtein < target && priorProtein + addedProtein >= target
    }
}
