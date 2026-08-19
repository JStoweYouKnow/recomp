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
    /// Nil is the default flow: search your own history, or type a name and fill macros in.
    /// The capture modes below are opt-in — breadth stays available without making the
    /// user choose an input method before they can start.
    @State private var advancedMode: InputMode?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var selectedMenuPhoto: PhotosPickerItem?
    @State private var selectedReceiptPhoto: PhotosPickerItem?
    @State private var recipeURL = ""
    @State private var foodSearchQuery = ""
    @State private var barcodeQuery = ""
    @State private var barcodeError: String?
    @State private var isLookingUpBarcode = false
    /// Last successful barcode lookup, kept so its portion choices stay on screen.
    @State private var scannedProduct: OpenFoodFactsClient.Product?
    @State private var selectedPortion: OpenFoodFactsClient.Portion?
    @State private var showScanner = false
    @State private var voiceTranscript = ""
    @State private var speech = MealSpeechTranscription()
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false
    @State private var showAIConsent = false
    @State private var pendingAIAction: (() -> Void)?
    @State private var saveError: String?

    enum InputMode: String, CaseIterable, Identifiable {
        case photo = "Photo"
        case menu = "Menu scan"
        case receipt = "Receipt scan"
        case barcode = "Barcode"
        case search = "Food search"
        case voice = "Voice"
        case recipe = "Recipe URL"
        case suggest = "AI Suggest"

        var id: String { rawValue }

        var icon: String {
            switch self {
            case .photo: return "camera.fill"
            case .menu: return "menucard.fill"
            case .receipt: return "receipt.fill"
            case .barcode: return "barcode.viewfinder"
            case .search: return "magnifyingglass"
            case .voice: return "mic.fill"
            case .recipe: return "link"
            case .suggest: return "sparkles"
            }
        }

        /// The four that earn a one-tap button; the rest live behind "More ways to add".
        static var quickActions: [InputMode] { [.barcode, .photo, .voice, .suggest] }

        static var secondaryActions: [InputMode] { [.search, .menu, .receipt, .recipe] }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Search your meals, or type a name", text: $name)
                        .textInputAutocapitalization(.sentences)
                    quickActionsRow
                } header: {
                    Text("Meal")
                } footer: {
                    if name.isEmpty && !suggestedMeals.isEmpty {
                        Text("Tap a recent meal to log it again.")
                    }
                }

                // The most common action for a returning user is re-logging something
                // they've eaten before, so it sits directly under the field rather than
                // behind an input-method choice.
                mealHistorySection

                Section("Details") {
                    Picker("Type", selection: $mealType) {
                        ForEach(MealType.allCases) { type in
                            Text(type.rawValue.capitalized).tag(type)
                        }
                    }
                }

                if let advancedMode {
                    switch advancedMode {
                    case .photo:   photoInputSection
                    case .menu:    menuScanSection
                    case .receipt: receiptScanSection
                    case .barcode: barcodeSection
                    case .search:  foodSearchSection
                    case .voice:   voiceInputSection
                    case .recipe:  recipeInputSection
                    case .suggest: suggestSection
                    }
                }

                moreWaysSection

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
            .onChange(of: advancedMode) { _, mode in
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

    // MARK: - Quick actions

    private var quickActionsRow: some View {
        HStack(spacing: 8) {
            ForEach(InputMode.quickActions) { mode in
                Button {
                    selectMode(mode)
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: mode.icon)
                            .font(.system(size: 17))
                        Text(shortLabel(for: mode))
                            .font(.caption2)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 52)
                    .background(
                        advancedMode == mode ? Color.appAccent.opacity(0.15) : Color.secondary.opacity(0.10),
                        in: RoundedRectangle(cornerRadius: 10)
                    )
                    .foregroundStyle(advancedMode == mode ? Color.appAccent : Color.primary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(mode.rawValue)
                .accessibilityAddTraits(advancedMode == mode ? [.isSelected] : [])
            }
        }
        .padding(.vertical, 2)
    }

    private func shortLabel(for mode: InputMode) -> String {
        switch mode {
        case .barcode: return "Scan"
        case .photo:   return "Photo"
        case .voice:   return "Voice"
        case .suggest: return "Coach"
        default:       return mode.rawValue
        }
    }

    /// Barcode goes straight to the camera — making the user pick a mode and *then*
    /// tap "Scan barcode" was two taps for the fastest path in the app.
    private func selectMode(_ mode: InputMode) {
        if advancedMode == mode {
            advancedMode = nil
            return
        }
        advancedMode = mode
        guard mode == .barcode, BarcodeScannerView.isSupported else { return }
        barcodeError = nil
        Task {
            if await BarcodeScannerView.requestCameraAccess() {
                showScanner = true
            } else {
                barcodeError = "Camera access is required to scan barcodes. Enable it in Settings."
            }
        }
    }

    private var moreWaysSection: some View {
        Section {
            Menu {
                ForEach(InputMode.secondaryActions) { mode in
                    Button {
                        advancedMode = mode
                    } label: {
                        Label(mode.rawValue, systemImage: mode.icon)
                    }
                }
                if advancedMode != nil {
                    Divider()
                    Button(role: .destructive) {
                        advancedMode = nil
                    } label: {
                        Label("Clear input method", systemImage: "xmark")
                    }
                }
            } label: {
                Label("More ways to add", systemImage: "ellipsis.circle")
            }
        }
    }

    // MARK: - History

    /// Distinct meals from the user's own log — filtered when typing, most-recent-first
    /// when the field is empty.
    private var suggestedMeals: [MealEntry] {
        let query = name.trimmingCharacters(in: .whitespacesAndNewlines)
        var seen = Set<String>()
        let matches = allMeals.filter { entry in
            guard query.isEmpty || entry.name.localizedCaseInsensitiveContains(query) else { return false }
            return seen.insert(entry.name.lowercased()).inserted
        }
        return Array(matches.prefix(query.isEmpty ? 6 : 8))
    }

    @ViewBuilder
    private var mealHistorySection: some View {
        if !suggestedMeals.isEmpty {
            Section(name.isEmpty ? "Recent meals" : "Your meals matching \"\(name)\"") {
                ForEach(suggestedMeals) { entry in
                    Button {
                        apply(entry)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.name)
                                    .foregroundStyle(.primary)
                                    .multilineTextAlignment(.leading)
                                Text("\(entry.macros.calories) cal · P:\(Int(entry.macros.protein))g C:\(Int(entry.macros.carbs))g F:\(Int(entry.macros.fat))g")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "arrow.up.left.circle")
                                .foregroundStyle(Color.appAccent)
                                .accessibilityHidden(true)
                        }
                    }
                    .accessibilityHint("Fills this meal's name and macros")
                }
            }
        }
    }

    private func apply(_ entry: MealEntry) {
        name = entry.name
        calories = entry.macros.calories
        protein = entry.macros.protein
        carbs = entry.macros.carbs
        fat = entry.macros.fat
        mealType = entry.mealType
        servings = 1
        Haptics.impact(.light)
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
                    .frame(minWidth: 60, alignment: .trailing)
            }
            HStack {
                Text(servings == 1 ? "Protein (g)" : "Protein / serving")
                Spacer()
                TextField("0", value: $protein, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(minWidth: 60, alignment: .trailing)
            }
            HStack {
                Text(servings == 1 ? "Carbs (g)" : "Carbs / serving")
                Spacer()
                TextField("0", value: $carbs, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(minWidth: 60, alignment: .trailing)
            }
            HStack {
                Text(servings == 1 ? "Fat (g)" : "Fat / serving")
                Spacer()
                TextField("0", value: $fat, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(minWidth: 60, alignment: .trailing)
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
                Text(err).font(.caption).foregroundStyle(Color.appError)
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
                Text(err).font(.caption).foregroundStyle(Color.appError)
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
                Text(barcodeError).font(.caption).foregroundStyle(Color.appError)
            }

            // Portion choices come from the product's own label. Handing the user
            // "per 100 g" and asking them to divide is arithmetic at a supermarket shelf.
            if let product = scannedProduct {
                Picker("Portion", selection: $selectedPortion) {
                    ForEach(product.portions) { portion in
                        Text(portion.label).tag(Optional(portion))
                    }
                }
                .pickerStyle(.inline)
                .onChange(of: selectedPortion) { _, portion in
                    guard let portion else { return }
                    applyPortion(portion)
                }

                if product.servingSizeGrams == nil {
                    Text("This product doesn't declare a serving size — pick 100 g and set servings below, or edit the macros directly.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
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
            barcodeQuery = trimmed
            scannedProduct = product
            // Preselect the label's own serving so the common case needs no interaction.
            if let portion = product.defaultPortion {
                selectedPortion = portion
                applyPortion(portion)
            }
        } else {
            scannedProduct = nil
            selectedPortion = nil
            barcodeError = "No nutrition found for that barcode. Try Food search or enter it manually."
        }
    }

    private func applyPortion(_ portion: OpenFoodFactsClient.Portion) {
        calories = portion.macros.calories
        protein = portion.macros.protein
        carbs = portion.macros.carbs
        fat = portion.macros.fat
        // Macros now describe one whole portion, so servings restarts at one.
        servings = 1
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
                Text(err).font(.caption).foregroundStyle(Color.appError)
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
                Text(err).font(.caption).foregroundStyle(Color.appError)
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
                    .foregroundStyle(Color.appError)
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

            if vm.isAnalyzing && advancedMode == .voice {
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

            if vm.isAnalyzing && advancedMode == .recipe {
                ProgressView("Parsing recipe…")
            }

            if let err = vm.recipeParseError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(Color.appError)
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
                Text(err).font(.caption).foregroundStyle(Color.appError)
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
