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
                if selectedTab == 2 {
                    await loadInsights()
                    await loadWeeklyReview()
                }
            }
        }
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
                MeasurementsView()
                SmartScaleEntryView()
                ProgressPhotosSection()
            }
            .padding()
        }
    }

    private var insightsSection: some View {
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
    var body: some View {
        GroupBox("Measurements") {
            VStack(spacing: 8) {
                measurementRow("Target Weight", value: "—")
                measurementRow("Body Fat %", value: "—")
                measurementRow("Muscle Mass", value: "—")
            }
        }
    }

    private func measurementRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.subheadline)
            Spacer()
            Text(value).font(.subheadline.weight(.medium))
        }
    }
}

struct SmartScaleEntryView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Query private var profiles: [UserProfile]

    @State private var weight = ""
    @State private var saveError: String?

    var body: some View {
        GroupBox("Smart Scale Entry") {
            TextField(
                profiles.first?.unitSystem == .metric ? "Weight (kg)" : "Weight (lbs)",
                text: $weight
            )
            .keyboardType(.decimalPad)
            if let saveError {
                Text(saveError).font(.caption2).foregroundStyle(Color.appError)
            }
            Button("Save Entry") { saveWeight() }
                .buttonStyle(.bordered)
                .disabled(weight.isEmpty)
        }
    }

    private func saveWeight() {
        guard let profile = profiles.first else { return }
        let trimmed = weight.replacingOccurrences(of: ",", with: ".")
        guard let value = Double(trimmed), value > 0 else {
            saveError = "Enter a valid number."
            return
        }
        let kg: Double
        switch profile.unitSystem {
        case .metric:
            kg = value
        case .us:
            kg = value * 0.45359237
        }
        profile.weight = kg
        saveError = nil
        do {
            try context.save()
            Task { await syncEngine?.markDirty() }
            weight = ""
        } catch {
            saveError = error.localizedDescription
        }
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
                    .disabled(isLoading)
                }
                if isLoading {
                    ProgressView()
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
