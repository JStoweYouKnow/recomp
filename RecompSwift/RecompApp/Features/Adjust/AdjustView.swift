import SwiftUI
import SwiftData
import RefactorKit

struct AdjustView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @State private var planService = PlanService()
    @State private var researchService = ResearchService()

    @State private var feedback = ""
    @State private var suggestion: AdjustSuggestion?
    @State private var errorMessage: String?
    @FocusState private var feedbackFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    macroTargetsSection
                    feedbackSection
                    if let suggestion { suggestionSection(suggestion) }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(Color.appError)
                    }
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Adjust Plan")
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { feedbackFocused = false }
                }
            }
        }
    }

    // MARK: - Macro targets editor

    private var macroTargetsSection: some View {
        MacroTargetsEditorCard(planService: planService, context: context, syncEngine: syncEngine)
    }

    // MARK: - Feedback + AI

    private var feedbackSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How's your plan going?")
                .font(.headline)

            Text("Share your feedback and the AI will suggest adjustments to your macros and training.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            TextEditor(text: $feedback)
                .frame(minHeight: 120)
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(.secondary.opacity(0.3))
                )
                .focused($feedbackFocused)

            HStack {
                Button {
                    Task {
                        do {
                            try await researchService.search(query: "latest nutrition guidelines for \(planService.currentPlan(context: context)?.reasoning ?? "fitness")")
                            if let answer = researchService.result?.answer {
                                feedback += "\n\nLatest research: \(answer)"
                            }
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                    }
                } label: {
                    Label("Add Latest Guidelines", systemImage: "globe")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .disabled(researchService.isSearching)

                Spacer()

                Button {
                    Task {
                        do {
                            let iso = ISO8601DateFormatter()
                            let planDTO = planService.currentPlan(context: context).map {
                                FitnessPlanDTO(from: $0, iso8601: iso)
                            }
                            suggestion = try await planService.adjustPlan(
                                feedback: feedback,
                                currentPlan: planDTO
                            )
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                    }
                } label: {
                    if planService.isAdjusting {
                        ProgressView()
                    } else {
                        Label("Adjust", systemImage: "sparkles")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(feedback.isEmpty || planService.isAdjusting)
            }
        }
    }

    private func suggestionSection(_ suggestion: AdjustSuggestion) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()

            Text("Suggestion")
                .font(.headline)

            Text(suggestion.explanation)
                .font(.body)

            if let newTargets = suggestion.newTargets {
                GroupBox("New Macro Targets") {
                    HStack(spacing: 16) {
                        macroStat("Cal", value: "\(newTargets.calories)", color: .appWarm)
                        macroStat("P", value: "\(Int(newTargets.protein))g", color: .appAccent)
                        macroStat("C", value: "\(Int(newTargets.carbs))g", color: .appSage)
                        macroStat("F", value: "\(Int(newTargets.fat))g", color: .appTerracotta)
                    }
                }
            }

            if let changes = suggestion.changes, !changes.isEmpty {
                GroupBox("Changes") {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(changes, id: \.self) { change in
                            Label(change, systemImage: "arrow.right.circle")
                                .font(.subheadline)
                        }
                    }
                }
            }

            Button {
                guard let plan = planService.currentPlan(context: context) else { return }
                planService.applyAdjustSuggestion(suggestion, to: plan)
                RecompAppGroupDefaults.shared.set(true, forKey: RecompUserDefaultsKeys.hasAdjustedPlan)
                do {
                    try context.save()
                    Task { await syncEngine?.markDirty() }
                } catch {
                    errorMessage = error.localizedDescription
                }
            } label: {
                Text("Apply Changes")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private func macroStat(_ label: String, value: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline)
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Macro targets editor card

private struct MacroTargetsEditorCard: View {
    var planService: PlanService
    var context: ModelContext
    var syncEngine: SyncEngine?

    enum TargetMode: String, CaseIterable {
        case base = "Base"
        case training = "Training"
        case rest = "Rest"
    }

    @State private var mode: TargetMode = .base
    @State private var saved = false
    @State private var errorMessage: String?

    // Base
    @State private var baseCal = ""
    @State private var basePro = ""
    @State private var baseCarb = ""
    @State private var baseFat = ""

    // Training
    @State private var trainCal = ""
    @State private var trainPro = ""
    @State private var trainCarb = ""
    @State private var trainFat = ""

    // Rest
    @State private var restCal = ""
    @State private var restPro = ""
    @State private var restCarb = ""
    @State private var restFat = ""

    private var plan: FitnessPlan? { planService.currentPlan(context: context) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Macro Targets")
                .font(.headline)

            Text("Set separate targets for training and rest days, or a single base average.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Picker("", selection: $mode) {
                ForEach(TargetMode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            switch mode {
            case .base:
                modeDescription("Weekly average — used as a fallback when no workout data is available.")
                macroFields(cal: $baseCal, pro: $basePro, carb: $baseCarb, fat: $baseFat)
            case .training:
                modeDescription("Used on workout days. Formula default: base +200 kcal / +50g carbs.")
                macroFields(cal: $trainCal, pro: $trainPro, carb: $trainCarb, fat: $trainFat)
                Button("Reset to formula") { resetToFormula(mode: .training) }
                    .font(.caption)
                    .foregroundStyle(Color.appAccent)
            case .rest:
                modeDescription("Used on rest/recovery days. Formula default: base −200 kcal / −50g carbs.")
                macroFields(cal: $restCal, pro: $restPro, carb: $restCarb, fat: $restFat)
                Button("Reset to formula") { resetToFormula(mode: .rest) }
                    .font(.caption)
                    .foregroundStyle(Color.appAccent)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(Color.appError)
            }

            Button {
                saveCurrentMode()
            } label: {
                Text(saved ? "Saved" : "Save targets")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(plan == nil)
        }
        .onAppear { loadFromPlan() }
        .onChange(of: plan?.id) { loadFromPlan() }
    }

    private func modeDescription(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    private func macroFields(cal: Binding<String>, pro: Binding<String>, carb: Binding<String>, fat: Binding<String>) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                macroField("Calories", value: cal, range: 800...5000)
                macroField("Protein g", value: pro, range: 20...400)
            }
            HStack(spacing: 12) {
                macroField("Carbs g", value: carb, range: 0...600)
                macroField("Fat g", value: fat, range: 0...200)
            }
        }
    }

    private func macroField(_ label: String, value: Binding<String>, range: ClosedRange<Int>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField(label, text: value)
                .keyboardType(.numberPad)
                .textFieldStyle(.roundedBorder)
        }
        .frame(maxWidth: .infinity)
    }

    private func loadFromPlan() {
        guard let p = plan else { return }
        let b = p.dietPlan.dailyTargets
        baseCal = "\(b.calories)"; basePro = "\(Int(b.protein))"
        baseCarb = "\(Int(b.carbs))"; baseFat = "\(Int(b.fat))"

        let t = p.dietPlan.trainingTargets ?? Macros(calories: b.calories + 200, protein: b.protein, carbs: b.carbs + 50, fat: b.fat)
        trainCal = "\(t.calories)"; trainPro = "\(Int(t.protein))"
        trainCarb = "\(Int(t.carbs))"; trainFat = "\(Int(t.fat))"

        let r = p.dietPlan.restTargets ?? Macros(calories: b.calories - 200, protein: b.protein, carbs: max(0, b.carbs - 50), fat: b.fat)
        restCal = "\(r.calories)"; restPro = "\(Int(r.protein))"
        restCarb = "\(Int(r.carbs))"; restFat = "\(Int(r.fat))"
    }

    private func resetToFormula(mode: TargetMode) {
        let baseCals = Int(baseCal) ?? (plan.map { $0.dietPlan.dailyTargets.calories } ?? 2000)
        let baseCarbs = Int(baseCarb) ?? (plan.map { Int($0.dietPlan.dailyTargets.carbs) } ?? 200)
        if mode == .training {
            trainCal = "\(baseCals + 200)"
            trainCarb = "\(baseCarbs + 50)"
        } else {
            restCal = "\(baseCals - 200)"
            restCarb = "\(max(0, baseCarbs - 50))"
        }
    }

    private func saveCurrentMode() {
        guard let plan else { return }
        errorMessage = nil
        switch mode {
        case .base:
            guard let m = parsedMacros(cal: baseCal, pro: basePro, carb: baseCarb, fat: baseFat) else {
                errorMessage = "Calories must be between 800 and 5000."
                return
            }
            plan.dietPlan.dailyTargets = m
        case .training:
            guard let m = parsedMacros(cal: trainCal, pro: trainPro, carb: trainCarb, fat: trainFat) else {
                errorMessage = "Calories must be between 800 and 5000."
                return
            }
            plan.dietPlan.trainingTargets = m
        case .rest:
            guard let m = parsedMacros(cal: restCal, pro: restPro, carb: restCarb, fat: restFat) else {
                errorMessage = "Calories must be between 800 and 5000."
                return
            }
            plan.dietPlan.restTargets = m
        }
        plan.synced = false
        do {
            try context.save()
            Task { await syncEngine?.markDirty() }
            saved = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saved = false }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func parsedMacros(cal: String, pro: String, carb: String, fat: String) -> Macros? {
        guard let c = Int(cal), c >= 800, c <= 5000 else { return nil }
        return Macros(
            calories: c,
            protein: Double(pro) ?? 0,
            carbs: Double(carb) ?? 0,
            fat: Double(fat) ?? 0
        )
    }
}
