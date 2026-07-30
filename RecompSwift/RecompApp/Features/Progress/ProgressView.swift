import SwiftUI
import SwiftData
import RefactorKit

struct MyProgressView: View {
    @Environment(\.modelContext) private var context
    @Environment(AuthService.self) private var auth
    @Query(sort: \Milestone.earnedAt) private var milestones: [Milestone]
    @Query(sort: \MealEntry.date, order: .reverse) private var meals: [MealEntry]
    @Query(sort: \WearableDaySummary.date, order: .reverse) private var wearables: [WearableDaySummary]
    @Query(sort: \BiofeedbackEntry.date, order: .reverse) private var biofeedbackEntries: [BiofeedbackEntry]
    @State private var planService = PlanService()

    @State private var selectedTab = 0
    @State private var insights: BiofeedbackInsightsResponse?
    @State private var insightsLoading = false
    @State private var insightsError: String?
    @State private var weeklyReview: WeeklyReview?
    @State private var weeklyLoading = false
    @State private var weeklyError: String?
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false
    @State private var showAIConsent = false

    private var xp: Int { MacroCalculator.totalXp(from: milestones) }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Section", selection: $selectedTab) {
                    Text("Milestones").tag(0)
                    Text("Body").tag(1)
                    Text("Insights").tag(2)
                }
                .pickerStyle(.segmented)
                .padding()

                switch selectedTab {
                case 0: badgesSection
                case 1: bodySection
                case 2: insightsSection
                default: badgesSection
                }
            }
            .navigationTitle("My Progress")
            .task(id: selectedTab) {
                if selectedTab == 2 && aiConsentGiven {
                    await loadInsights()
                    await loadWeeklyReview()
                }
            }
            .sheet(isPresented: $showAIConsent) {
                AIConsentView(
                    onAccept: {
                        aiConsentGiven = true
                        showAIConsent = false
                        Task {
                            await loadInsights()
                            await loadWeeklyReview()
                        }
                    },
                    onDecline: { showAIConsent = false }
                )
            }
        }
        .hidesUIKitNavigationBar()
    }

    private var badgesSection: some View {
        ScrollView {
            VStack(spacing: 20) {
                XPLevelView(xp: xp)

                BadgesGrid(earned: milestones)
            }
            .padding()
        }
    }

    private var bodySection: some View {
        ScrollView {
            VStack(spacing: 16) {
                BodyMeasurementTargetsCard()
                MeasurementsView()
                SmartScaleEntryView()
                ProgressPhotosSection()
            }
            .padding()
        }
    }

    @ViewBuilder
    private var insightsSection: some View {
        if aiConsentGiven {
            ScrollView {
                VStack(spacing: 16) {
                    BiofeedbackInsightsView(
                        insights: insights,
                        isLoading: insightsLoading,
                        error: insightsError,
                        onRefresh: { await loadInsights() }
                    )
                    WeeklyRecapCard(
                        review: weeklyReview,
                        isLoading: weeklyLoading,
                        error: weeklyError,
                        onGenerate: { await loadWeeklyReview() }
                    )
                }
                .padding()
            }
        } else {
            VStack(spacing: 16) {
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 44))
                    .foregroundStyle(Color.appAccent)
                    .accessibilityHidden(true)
                Text("AI Insights")
                    .font(.title3.weight(.semibold))
                Text("Enable AI features to unlock biofeedback insights and weekly progress reviews.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Button("Enable AI Features") {
                    showAIConsent = true
                }
                .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.top, 60)
        }
    }

    private func cutoffDateString(daysAgo: Int) -> String {
        let cal = Calendar.current
        let d = cal.date(byAdding: .day, value: -daysAgo, to: Date()) ?? Date()
        return DateHelpers.dateString(from: d)
    }

    private func loadInsights() async {
        insightsLoading = true
        insightsError = nil
        defer { insightsLoading = false }
        let cutoff = cutoffDateString(daysAgo: 14)
        let bfRows: [BiofeedbackRowPayload] = biofeedbackEntries
            .filter { $0.date >= cutoff }
            .map {
                BiofeedbackRowPayload(
                    date: $0.date,
                    time: $0.time,
                    energy: $0.energy,
                    mood: $0.mood,
                    hunger: $0.hunger,
                    stress: $0.stress,
                    soreness: $0.soreness
                )
            }
        let mealRows: [MealInsightRowPayload] = meals
            .filter { $0.date >= cutoff }
            .map { MealInsightRowPayload(date: $0.date, name: $0.name, macros: $0.macros) }
        let wearRows: [WearableInsightRowPayload] = wearables
            .filter { $0.date >= cutoff }
            .map {
                WearableInsightRowPayload(
                    date: $0.date,
                    provider: $0.provider.rawValue,
                    steps: $0.steps,
                    caloriesBurned: $0.caloriesBurned,
                    sleepScore: $0.sleepScore,
                    sleepDuration: $0.sleepDuration,
                    weight: $0.weight
                )
            }
        do {
            let payload = BiofeedbackInsightsRequest(
                biofeedback: bfRows,
                meals: mealRows,
                wearableData: wearRows
            )
            insights = try await APIClient.shared.request(BiofeedbackAPI.insights(payload: payload))
        } catch {
            insightsError = error.localizedDescription
        }
    }

    private func loadWeeklyReview() async {
        weeklyLoading = true
        weeklyError = nil
        defer { weeklyLoading = false }
        let cutoff = cutoffDateString(daysAgo: 21)
        let mealPayloads: [MealReviewEntryPayload] = meals
            .filter { $0.date >= cutoff }
            .map {
                MealReviewEntryPayload(
                    id: $0.id,
                    date: $0.date,
                    mealType: $0.mealType.rawValue,
                    name: $0.name,
                    macros: $0.macros
                )
            }
        let wearPayloads: [WearableReviewEntryPayload] = wearables
            .filter { $0.date >= cutoff }
            .map {
                WearableReviewEntryPayload(
                    date: $0.date,
                    provider: $0.provider.rawValue,
                    steps: $0.steps,
                    caloriesBurned: $0.caloriesBurned,
                    activeMinutes: $0.activeMinutes,
                    sleepScore: $0.sleepScore,
                    sleepDuration: $0.sleepDuration,
                    readinessScore: $0.readinessScore,
                    heartRateAvg: $0.heartRateAvg,
                    heartRateResting: $0.heartRateResting,
                    weight: $0.weight,
                    bodyFatPercent: $0.bodyFatPercent,
                    muscleMass: $0.muscleMass
                )
            }
        let targets = planService.currentPlan(context: context)?.dietPlan.dailyTargets
            ?? Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
        let goal = auth.currentUser?.goal.rawValue ?? "maintain"
        let userName = auth.currentUser?.name ?? "Athlete"
        do {
            let payload = WeeklyReviewGeneratePayload(
                meals: mealPayloads,
                targets: targets,
                wearableData: wearPayloads,
                goal: goal,
                userName: userName
            )
            weeklyReview = try await APIClient.shared.request(WeeklyReviewAPI.generate(payload: payload))
        } catch {
            weeklyError = error.localizedDescription
        }
    }
}

struct XPLevelView: View {
    let xp: Int

    private var level: Int { MacroCalculator.xpLevel(for: xp) }
    private var progress: (current: Int, needed: Int) { MacroCalculator.xpToNextLevel(currentXP: xp) }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Level \(level)")
                    .font(.title2.weight(.bold))
                Spacer()
                Text("\(xp) XP")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.appAccent.opacity(0.2))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.appAccent)
                        .frame(width: geo.size.width * (Double(progress.current) / Double(max(progress.needed, 1))))
                }
            }
            .frame(height: 8)

            Text("\(progress.current)/\(progress.needed) XP to next level")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Level \(level), \(xp) XP")
        .accessibilityValue("\(progress.current) of \(progress.needed) XP to next level")
    }
}

struct BadgesGrid: View {
    let earned: [Milestone]
    private let columns = [GridItem(.adaptive(minimum: 80))]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 16) {
            ForEach(MilestoneType.allCases) { type in
                let milestone = earned.first { $0.milestoneType == type }
                let isEarned = milestone != nil

                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(isEarned ? .yellow.opacity(0.2) : .gray.opacity(0.1))
                            .frame(width: 56, height: 56)

                        Image(systemName: badgeIcon(for: type))
                            .font(.title3)
                            .foregroundStyle(isEarned ? .yellow : .gray.opacity(0.4))
                    }

                    Text(badgeLabel(for: type))
                        .font(.caption2)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(isEarned ? .primary : .secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(badgeLabel(for: type))
                .accessibilityValue(isEarned ? "Earned" : "Locked")
            }
        }
    }

    private func badgeIcon(for type: MilestoneType) -> String {
        switch type {
        case .firstMeal: return "fork.knife.circle"
        case .mealStreak3, .mealStreak7, .mealStreak14, .mealStreak30: return "flame"
        case .macroHitWeek, .macroHitMonth: return "target"
        case .weekWarrior: return "trophy"
        case .planAdjuster: return "slider.horizontal.3"
        case .earlyAdopter: return "star"
        case .wearableSynced: return "applewatch"
        case .hydrationStreak3, .hydrationStreak7: return "drop"
        case .firstFast, .fastingStreak7: return "timer"
        case .biofeedbackStreak7: return "heart.text.square"
        case .metabolicModeled: return "chart.xyaxis.line"
        case .recoveryListener: return "bed.double"
        case .pantryStocked: return "refrigerator"
        case .firstMealPrep: return "takeoutbag.and.cup.and.straw"
        case .menuScanner: return "doc.viewfinder"
        case .coachCheckInStreak7: return "bubble.left.and.text.bubble.right"
        case .firstChallengeWon: return "medal"
        case .challengeCreator: return "flag"
        case .musicConnected: return "music.note"
        case .supplementTracker: return "pills"
        case .bloodWorkUploaded: return "cross.case"
        }
    }

    private func badgeLabel(for type: MilestoneType) -> String {
        type.rawValue.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

struct MeasurementsView: View {
    @Query(sort: \WearableDaySummary.date, order: .reverse) private var summaries: [WearableDaySummary]
    @Query private var profiles: [UserProfile]

    private var isMetric: Bool { profiles.first?.unitSystem == .metric }

    private var latest: WearableDaySummary? {
        summaries.first(where: { $0.provider == .scale && ($0.weight != nil || $0.bodyFatPercent != nil) })
        ?? summaries.first(where: { $0.weight != nil || $0.bodyFatPercent != nil })
    }

    var body: some View {
        GroupBox("Latest Measurements") {
            VStack(spacing: 8) {
                if let latest {
                    if let w = latest.weight {
                        // Stored in lbs (sync contract); convert for metric display.
                        let displayed = isMetric ? w * WearableMassStoredPounds.lbsToKg : w
                        let unit = isMetric ? "kg" : "lbs"
                        measurementRow("Weight", value: String(format: "%.1f \(unit)", displayed), detail: latest.date)
                    }
                    if let bf = latest.bodyFatPercent {
                        measurementRow("Body Fat", value: String(format: "%.1f%%", bf))
                    }
                    if let mm = latest.muscleMass {
                        let displayed = isMetric ? mm * WearableMassStoredPounds.lbsToKg : mm
                        let unit = isMetric ? "kg" : "lbs"
                        measurementRow("Muscle Mass", value: String(format: "%.1f \(unit)", displayed))
                    }
                    if let bmi = latest.bmi {
                        measurementRow("BMI", value: String(format: "%.1f", bmi))
                    }
                    if let bmr = latest.bmr {
                        measurementRow("BMR", value: "\(Int(bmr)) kcal")
                    }
                    if let ma = latest.metabolicAge {
                        measurementRow("Metabolic Age", value: "\(ma) yrs")
                    }
                } else {
                    Text("No measurements yet. Log your first entry below.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                }
            }
        }
    }

    private func measurementRow(_ label: String, value: String, detail: String? = nil) -> some View {
        HStack {
            Text(label).font(.subheadline)
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(value).font(.subheadline.weight(.medium))
                if let detail {
                    Text(detail).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}

/// Goal weight, body fat, and muscle mass — synced with the web app (`MeasurementTargets` / History targets).
struct BodyMeasurementTargetsCard: View {
    @Environment(\.syncEngine) private var syncEngine
    @Query private var profiles: [UserProfile]

    @State private var weightText = ""
    @State private var bodyFatText = ""
    @State private var muscleText = ""
    @State private var saveMessage: String?
    @State private var isSaving = false

    private var isMetric: Bool { profiles.first?.unitSystem == .metric }
    private var massUnit: String { isMetric ? "kg" : "lbs" }

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Text("Set goals for weight, body fat, and muscle. They sync with your account and match the web History targets.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                targetRow("Goal weight", unit: massUnit, text: $weightText)
                targetRow("Goal body fat", unit: "%", text: $bodyFatText)
                targetRow("Goal muscle mass", unit: massUnit, text: $muscleText)

                if let saveMessage {
                    Text(saveMessage)
                        .font(.caption2)
                        .foregroundStyle(Color.appSuccess)
                }

                HStack(spacing: 12) {
                    Button {
                        Task { await saveTargets() }
                    } label: {
                        Group {
                            if isSaving { ProgressView() } else { Text("Save targets") }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isSaving)

                    Button("Clear") {
                        weightText = ""
                        bodyFatText = ""
                        muscleText = ""
                        MeasurementTargetsStorage.save(MeasurementTargets())
                        Task {
                            await syncEngine?.markDirty()
                            _ = await syncEngine?.syncNow()
                        }
                        saveMessage = "Targets cleared"
                        Task {
                            try? await Task.sleep(nanoseconds: 2_000_000_000)
                            await MainActor.run { saveMessage = nil }
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(isSaving)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } label: {
            Label("Body measurement targets", systemImage: "target")
        }
        .onAppear { reloadFromStorage() }
        .onChange(of: profiles.first?.unitSystem) { _, _ in reloadFromStorage() }
    }

    @ViewBuilder
    private func targetRow(_ label: String, unit: String, text: Binding<String>) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
            Spacer()
            TextField("–", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
            Text(unit)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 44, alignment: .leading)
        }
    }

    private func reloadFromStorage() {
        saveMessage = nil
        guard let t = MeasurementTargetsStorage.load() else {
            weightText = ""
            bodyFatText = ""
            muscleText = ""
            return
        }
        if isMetric {
            if let w = t.targetWeightLbs { weightText = String(format: "%.1f", w / 2.20462) }
            else { weightText = "" }
            if let m = t.targetMuscleMassLbs { muscleText = String(format: "%.1f", m / 2.20462) }
            else { muscleText = "" }
        } else {
            if let w = t.targetWeightLbs { weightText = String(format: "%.1f", w) }
            else { weightText = "" }
            if let m = t.targetMuscleMassLbs { muscleText = String(format: "%.1f", m) }
            else { muscleText = "" }
        }
        if let b = t.targetBodyFatPercent { bodyFatText = String(format: "%.1f", b) }
        else { bodyFatText = "" }
    }

    private func saveTargets() async {
        isSaving = true
        saveMessage = nil
        defer { isSaving = false }

        let wTrim = weightText.trimmingCharacters(in: .whitespaces)
        let bfTrim = bodyFatText.trimmingCharacters(in: .whitespaces)
        let mTrim = muscleText.trimmingCharacters(in: .whitespaces)

        var next = MeasurementTargets()

        if !wTrim.isEmpty, let w = parseDouble(wTrim), w > 0 {
            let lbs = isMetric ? w * 2.20462 : w
            if lbs >= 44 && lbs <= 1100 { next.targetWeightLbs = lbs }
        }
        if !bfTrim.isEmpty, let b = parseDouble(bfTrim), b >= 0 && b <= 100 {
            next.targetBodyFatPercent = b
        }
        if !mTrim.isEmpty, let m = parseDouble(mTrim), m >= 0 {
            let lbs = isMetric ? m * 2.20462 : m
            if lbs <= 500 { next.targetMuscleMassLbs = lbs }
        }

        if next.targetWeightLbs == nil && next.targetBodyFatPercent == nil && next.targetMuscleMassLbs == nil {
            MeasurementTargetsStorage.save(MeasurementTargets())
        } else {
            MeasurementTargetsStorage.save(next)
        }

        await syncEngine?.markDirty()
        _ = await syncEngine?.syncNow()
        saveMessage = "Saved and synced."
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        await MainActor.run { saveMessage = nil }
    }

    private func parseDouble(_ s: String) -> Double? {
        Double(s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }
}

struct SmartScaleEntryView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Query private var profiles: [UserProfile]
    @Query(sort: \WearableDaySummary.date, order: .reverse) private var summaries: [WearableDaySummary]

    @State private var entryDate = Date()
    @State private var weight = ""
    @State private var bodyFatPercent = ""
    @State private var muscleMass = ""
    @State private var bmi = ""
    @State private var bmr = ""
    @State private var metabolicAge = ""
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var showSuccess = false

    private var isMetric: Bool { profiles.first?.unitSystem == .metric }
    private var massUnit: String { isMetric ? "kg" : "lbs" }

    private var allEmpty: Bool {
        [weight, bodyFatPercent, muscleMass, bmi, bmr, metabolicAge]
            .allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    var body: some View {
        GroupBox {
            VStack(spacing: 12) {
                DatePicker("Date", selection: $entryDate, in: ...Date(), displayedComponents: .date)
                    .datePickerStyle(.compact)

                Divider()

                scaleRow("Weight", unit: massUnit, text: $weight)
                scaleRow("Body Fat", unit: "%", text: $bodyFatPercent)
                scaleRow("Muscle Mass", unit: massUnit, text: $muscleMass)
                scaleRow("BMI", unit: "kg/m²", text: $bmi)
                scaleRow("BMR", unit: "kcal", text: $bmr, decimal: false)
                scaleRow("Metabolic Age", unit: "yrs", text: $metabolicAge, decimal: false)

                if let err = saveError {
                    Text(err)
                        .font(.caption2)
                        .foregroundStyle(Color.appError)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if showSuccess {
                    Label("Saved successfully", systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(Color.appSuccess)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    Task { await saveEntry() }
                } label: {
                    Group {
                        if isSaving { ProgressView() } else { Text("Save Entry") }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSaving || allEmpty)
            }
        } label: {
            Label("Smart Scale Entry", systemImage: "scalemass")
        }
    }

    @ViewBuilder
    private func scaleRow(_ label: String, unit: String, text: Binding<String>, decimal: Bool = true) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
            Spacer()
            TextField("–", text: text)
                .keyboardType(decimal ? .decimalPad : .numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
            Text(unit)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 44, alignment: .leading)
        }
    }

    private func saveEntry() async {
        isSaving = true
        saveError = nil
        showSuccess = false
        defer { isSaving = false }

        let profile = profiles.first
        let metric = isMetric

        // Values as entered by the user — lbs (US) or kg (metric).
        let inputWeight = parseDouble(weight).flatMap { $0 > 0 ? $0 : nil }
        let inputMuscleMass = parseDouble(muscleMass).flatMap { $0 > 0 ? $0 : nil }
        let fatPct = parseDouble(bodyFatPercent).flatMap { $0 > 0 ? $0 : nil }
        let bmiVal = parseDouble(bmi).flatMap { $0 > 0 ? $0 : nil }
        let bmrVal = parseDouble(bmr).flatMap { $0 > 0 ? $0 : nil }
        let metAge = parseInt(metabolicAge).flatMap { $0 > 0 ? $0 : nil }

        // UserProfile + wearable summaries + scale API use **pounds** for mass.
        let weightLbs = inputWeight.map { metric ? $0 * 2.20462 : $0 }
        let serverMuscleMassLbs = inputMuscleMass.map { metric ? $0 * 2.20462 : $0 }

        let dateStr = DateHelpers.dateString(from: entryDate)
        let summaryId = "\(dateStr)_scale"

        let existing = summaries.first(where: { $0.id == summaryId })
        let summary: WearableDaySummary
        if let e = existing {
            summary = e
        } else {
            let s = WearableDaySummary(date: dateStr, provider: .scale)
            context.insert(s)
            summary = s
        }

        if let wl = weightLbs { summary.weight = wl }
        if let f = fatPct { summary.bodyFatPercent = f }
        if let ml = serverMuscleMassLbs { summary.muscleMass = ml }
        if let b = bmiVal { summary.bmi = b }
        if let b = bmrVal { summary.bmr = b }
        if let a = metAge { summary.metabolicAge = a }

        // Keep profile weight current (always stored in lbs).
        if DateHelpers.dateString(from: Date()) == dateStr, let lbs = weightLbs {
            profile?.weight = lbs
        }

        do {
            try context.save()
        } catch {
            saveError = error.localizedDescription
            return
        }

        // Server payload uses the user's native unit — mirrors what the web app sends.
        let payload = ScaleEntryPayload(
            date: dateStr,
            weightLbs: weightLbs,
            bodyFatPercent: fatPct,
            muscleMass: serverMuscleMassLbs,
            bmi: bmiVal,
            bmr: bmrVal,
            metabolicAge: metAge
        )

        do {
            try await APIClient.shared.requestVoid(WearableAPI.scaleEntry(payload: payload))
        } catch {
            saveError = "Saved locally. Server sync failed: \(error.localizedDescription)"
        }

        await syncEngine?.markDirty()
        _ = await syncEngine?.syncNow()

        weight = ""
        bodyFatPercent = ""
        muscleMass = ""
        bmi = ""
        bmr = ""
        metabolicAge = ""
        showSuccess = true

        try? await Task.sleep(nanoseconds: 2_000_000_000)
        showSuccess = false
    }

    private func parseDouble(_ s: String) -> Double? {
        Double(s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }

    private func parseInt(_ s: String) -> Int? {
        Int(s.trimmingCharacters(in: .whitespaces))
    }
}

struct ProgressPhotosSection: View {
    var body: some View {
        GroupBox("Progress Photos") {
            HStack(spacing: 16) {
                photoPlaceholder("Front")
                photoPlaceholder("Side")
                photoPlaceholder("Back")
            }
        }
    }

    private func photoPlaceholder(_ label: String) -> some View {
        VStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(.gray.opacity(0.1))
                .frame(height: 100)
                .overlay {
                    Image(systemName: "camera")
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct BiofeedbackInsightsView: View {
    let insights: BiofeedbackInsightsResponse?
    let isLoading: Bool
    let error: String?
    let onRefresh: () async -> Void

    var body: some View {
        GroupBox("Biofeedback Insights") {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Spacer()
                    Button {
                        Task { await onRefresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Refresh insights")
                    .disabled(isLoading)
                }
                if isLoading {
                    VStack(alignment: .leading, spacing: 10) {
                        SkeletonBlock(width: 140, height: 13)
                        TextSkeleton(lines: 2)
                        SkeletonBlock(width: 180, height: 13)
                    }
                    .padding(.vertical, 2)
                } else if let error {
                    Text(error).font(.caption).foregroundStyle(Color.appError)
                } else if let insights {
                    if insights.correlations.isEmpty {
                        Text("Keep logging — not enough signal yet for strong correlations.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(insights.correlations.enumerated()), id: \.offset) { _, row in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.factor).font(.caption.weight(.semibold))
                                Text(row.observation).font(.caption2).foregroundStyle(.secondary)
                                Text(row.strength).font(.caption2).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                    if !insights.recommendations.isEmpty {
                        Divider()
                        Text("Recommendations").font(.caption.weight(.semibold))
                        ForEach(Array(insights.recommendations.enumerated()), id: \.offset) { _, line in
                            Text("• \(line)").font(.caption2)
                        }
                    }
                } else {
                    Text("Pull to refresh or open this tab to load AI insights.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct WeeklyRecapCard: View {
    let review: WeeklyReview?
    let isLoading: Bool
    let error: String?
    let onGenerate: () async -> Void

    var body: some View {
        GroupBox("Weekly Recap") {
            VStack(alignment: .leading, spacing: 10) {
                Button {
                    Task { await onGenerate() }
                } label: {
                    if isLoading {
                        ProgressView()
                    } else {
                        Text(review == nil ? "Generate weekly review" : "Regenerate")
                            .font(.caption.weight(.semibold))
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)

                if let error {
                    Text(error).font(.caption).foregroundStyle(Color.appError)
                } else if let review {
                    Text(review.summary).font(.caption)
                    if let score = review.weeklyScore {
                        Text("Score: \(score)/10").font(.caption2).foregroundStyle(.secondary)
                    }
                    Divider()
                    Text("Meals").font(.caption.weight(.semibold))
                    Text(review.mealAnalysis).font(.caption2).foregroundStyle(.secondary)
                    Text("Wellness").font(.caption.weight(.semibold))
                    Text(review.wearableInsights).font(.caption2).foregroundStyle(.secondary)
                    if !review.recommendations.isEmpty {
                        Divider()
                        ForEach(Array(review.recommendations.enumerated()), id: \.offset) { _, r in
                            Text("• \(r)").font(.caption2)
                        }
                    }
                } else {
                    Text("Generate a multi-agent recap from your last few weeks of meals and wearables.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
