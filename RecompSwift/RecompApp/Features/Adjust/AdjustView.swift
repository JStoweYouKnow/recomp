import SwiftUI
import SwiftData
import RefactorKit

struct AdjustView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @State private var planService = PlanService()
    @State private var researchService = ResearchService()

    /// Set when presented as a sheet (Adjust is no longer a tab); adds a Done button.
    var onDone: (() -> Void)? = nil

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
                if let onDone {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", action: onDone)
                    }
                }
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
                                currentPlan: planDTO,
                                context: context
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

private struct MacroFieldStrings {
    var cal = ""
    var pro = ""
    var carb = ""
    var fat = ""
}

private struct MacroTargetsEditorCard: View {
    var planService: PlanService
    var context: ModelContext
    var syncEngine: SyncEngine?

    @State private var activeDay: WeekdayMacroKey = .mon
    @State private var fieldsByDay: [WeekdayMacroKey: MacroFieldStrings] = [:]
    @State private var cal = ""
    @State private var pro = ""
    @State private var carb = ""
    @State private var fat = ""
    @State private var saved = false
    @State private var errorMessage: String?

    private var plan: FitnessPlan? { planService.currentPlan(context: context) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Macro Targets")
                .font(.headline)

            Text("Set calories and macros for each day of the week (Mon–Sun).")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(WeekdayMacroKey.allCases, id: \.self) { day in
                        Button {
                            persistActiveDayFields()
                            activeDay = day
                            loadActiveDayFields()
                        } label: {
                            Text(day.shortLabel)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(activeDay == day ? Color.appAccent.opacity(0.2) : Color.secondary.opacity(0.12))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            macroFields

            Button("Fill from workout schedule") { fillFromSchedule() }
                .font(.caption)
                .foregroundStyle(Color.appAccent)

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(Color.appError)
            }

            Button { saveWeek() } label: {
                Text(saved ? "Saved" : "Save weekly targets")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(plan == nil)
        }
        .onAppear { loadFromPlan() }
        .onChange(of: plan?.id) { _, _ in loadFromPlan() }
    }

    private var macroFields: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                macroField("Calories", value: $cal, range: 800...5000)
                macroField("Protein g", value: $pro, range: 20...400)
            }
            HStack(spacing: 12) {
                macroField("Carbs g", value: $carb, range: 0...600)
                macroField("Fat g", value: $fat, range: 0...200)
            }
        }
    }

    private func persistActiveDayFields() {
        fieldsByDay[activeDay] = MacroFieldStrings(cal: cal, pro: pro, carb: carb, fat: fat)
    }

    private func loadActiveDayFields() {
        let f = fieldsByDay[activeDay] ?? MacroFieldStrings()
        cal = f.cal; pro = f.pro; carb = f.carb; fat = f.fat
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
        let map = WeekdayMacros.effectiveWeekdayMap(for: p)
        var next = [WeekdayMacroKey: MacroFieldStrings]()
        for key in WeekdayMacroKey.allCases {
            let m = map[key] ?? p.dietPlan.dailyTargets
            next[key] = MacroFieldStrings(
                cal: "\(m.calories)",
                pro: "\(Int(m.protein))",
                carb: "\(Int(m.carbs))",
                fat: "\(Int(m.fat))"
            )
        }
        fieldsByDay = next
        loadActiveDayFields()
    }

    private func fillFromSchedule() {
        guard let p = plan else { return }
        let b = p.dietPlan.dailyTargets
        let training = p.dietPlan.trainingTargets ?? Macros(
            calories: b.calories + 200, protein: b.protein, carbs: b.carbs + 50, fat: b.fat
        )
        let rest = p.dietPlan.restTargets ?? Macros(
            calories: max(0, b.calories - 200), protein: b.protein, carbs: max(0, b.carbs - 50), fat: b.fat
        )
        let seeded = WeekdayMacros.seedFromSchedule(
            training: training,
            rest: rest,
            workoutDays: p.workoutPlan.weeklyPlan
        )
        var next = [WeekdayMacroKey: MacroFieldStrings]()
        for key in WeekdayMacroKey.allCases {
            let m = seeded[key.rawValue] ?? b
            next[key] = MacroFieldStrings(
                cal: "\(m.calories)",
                pro: "\(Int(m.protein))",
                carb: "\(Int(m.carbs))",
                fat: "\(Int(m.fat))"
            )
        }
        fieldsByDay = next
        loadActiveDayFields()
    }

    private func saveWeek() {
        guard let plan else { return }
        errorMessage = nil
        persistActiveDayFields()
        var merged = [String: Macros]()
        for key in WeekdayMacroKey.allCases {
            let f = fieldsByDay[key] ?? MacroFieldStrings()
            guard let m = parsedMacros(cal: f.cal, pro: f.pro, carb: f.carb, fat: f.fat) else {
                errorMessage = "Each day needs calories between 800 and 5000."
                return
            }
            merged[key.rawValue] = m
        }
        planService.applyWeekdayTargets(merged, to: plan)
        RecompAppGroupDefaults.shared.set(true, forKey: RecompUserDefaultsKeys.hasAdjustedPlan)
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
