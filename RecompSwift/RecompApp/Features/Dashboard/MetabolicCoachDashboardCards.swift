import SwiftUI
import SwiftData
import RefactorKit

struct MetabolicModelDashboardCard: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Query(sort: \MealEntry.date, order: .reverse) private var meals: [MealEntry]
    @Query(sort: \WearableDaySummary.date, order: .reverse) private var wearables: [WearableDaySummary]
    @Query(sort: \MetabolicModel.lastUpdated, order: .reverse) private var metabolicModels: [MetabolicModel]
    @Environment(AuthService.self) private var auth

    @State private var planService = PlanService()
    @State private var isUpdating = false
    @State private var errorText: String?
    @State private var resultSummary: String?
    @State private var unitDebugSummary: String?
    @State private var showExplainer = false

    private static let minReasonableTDEE = 1200.0
    private static let maxReasonableTDEE = 4500.0

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                Text("Adaptive TDEE")
                    .font(.subheadline.weight(.semibold))

                if let resultSummary {
                    Text(resultSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Log meals and weight for 7+ days to learn your true metabolism.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let errorText {
                    Text(errorText)
                        .font(.caption2)
                        .foregroundStyle(Color.appError)
                }
                #if DEBUG
                if let unitDebugSummary {
                    Text(unitDebugSummary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                #endif

                DisclosureGroup(isExpanded: $showExplainer) {
                    Text(
                        "Adaptive TDEE learns your actual burn from intake vs. weight change, " +
                            "instead of using only height, weight, and a generic activity multiplier."
                    )
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                } label: {
                    Text("How it works")
                        .font(.caption)
                }

                Button {
                    Task { await refreshModel() }
                } label: {
                    if isUpdating {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text(resultSummary == nil ? "Update model" : "Refresh model")
                            .font(.caption.weight(.semibold))
                    }
                }
                .buttonStyle(.bordered)
                .disabled(isUpdating)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .onAppear { syncSummaryFromStores() }
        .onChange(of: metabolicModels.count) { _, _ in syncSummaryFromStores() }
        .onChange(of: metabolicModels.first?.estimatedTDEE ?? 0) { _, _ in syncSummaryFromStores() }
    }

    /// Prefer SwiftData row from server sync (`fetchAndApply`), then on-device API cache — they can differ.
    private func syncSummaryFromStores() {
        if let m = metabolicModels.first, m.confidence >= 20 {
            let safeTDEE = clampTDEE(m.estimatedTDEE)
            resultSummary =
                "Last estimate: \(Int(safeTDEE)) kcal/day · \(Int(m.confidence))% confidence " +
                "(\(m.dataPoints.count) pts)"
            return
        }
        if let cached = MetabolicModelStorage.load(), cached.confidence >= 20 {
            let safeTDEE = clampTDEE(cached.estimatedTDEE)
            resultSummary =
                "Last estimate: \(Int(safeTDEE)) kcal/day · \(cached.confidence)% confidence " +
                "(\(cached.dataPointCount) pts)"
            return
        }
        resultSummary = nil
    }

    private func refreshModel() async {
        isUpdating = true
        errorText = nil
        defer { isUpdating = false }

        let plan = planService.currentPlan(context: context)
        let targets = plan?.dietPlan.dailyTargets ?? Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)

        // Profile weight stored in lbs — convert to kg for the carry-forward starting point.
        let baseWeightKg = (auth.currentUser?.weight ?? 165) * 0.45359237

        // The server algorithm only uses weightKg + totalIntake — totalExpenditure is
        // stored in the data point struct but never read by the regression. Mirror the
        // web app's assembly: meals for intake, wearable weights in **lbs** → kg for the API (`weightKg`).
        var byDate: [String: (intake: Double, weightKg: Double?)] = [:]
        var wearableDaysWithWeight = 0
        for m in meals.prefix(600) {
            var cur = byDate[m.date] ?? (0, nil)
            cur.intake += Double(m.macros.calories)
            byDate[m.date] = cur
        }
        for w in wearables.prefix(200) {
            var cur = byDate[w.date] ?? (0, nil)
            if let lbs = w.weight {
                cur.weightKg = WearableMassStoredPounds.weightKg(fromStoredPounds: lbs)
                wearableDaysWithWeight += 1
            }
            byDate[w.date] = cur
        }
        unitDebugSummary = "Wearable weight: lbs → kg (\(wearableDaysWithWeight) day rows)."

        var prevWeight = baseWeightKg
        let sortedDates = byDate.keys.sorted()
        var points: [MetabolicDataPointPayload] = []
        for d in sortedDates {
            guard let row = byDate[d], row.intake > 0 else { continue }
            let wKg = row.weightKg ?? prevWeight
            if let w = row.weightKg { prevWeight = w }
            points.append(
                MetabolicDataPointPayload(
                    date: d,
                    weightKg: wKg,
                    totalIntake: row.intake,
                    totalExpenditure: Double(targets.calories)
                )
            )
        }

        guard points.count >= 7 else {
            errorText = "Need 7+ days with meals logged."
            return
        }

        do {
            let cachedHistory = MetabolicModelStorage.load()?.history ?? []
            let historyPayload = cachedHistory.map {
                MetabolicHistoryEntry(date: $0.date, tdee: $0.tdee, confidence: Double($0.confidence))
            }
            let payload = MetabolicBatchUpdatePayload(dataPoints: points, currentTDEE: targets.calories, history: historyPayload)
            let model: MetabolicModelResponse = try await APIClient.shared.request(MiscAPI.metabolicUpdate(payload: payload))
            let safeTDEE = clampTDEE(model.estimatedTDEE)
            let safeModel = MetabolicModelResponse(
                estimatedTDEE: safeTDEE,
                confidence: model.confidence,
                lastUpdated: model.lastUpdated,
                message: model.message,
                history: model.history
            )
            MetabolicModelStorage.save(safeModel, dataPointCount: points.count)
            upsertSwiftDataMetabolicModel(safeModel, points: points)
            if let msg = model.message, !msg.isEmpty {
                resultSummary =
                    "\(Int(safeTDEE)) kcal/day · \(model.confidence)% — \(msg)"
            } else {
                resultSummary =
                    "Estimated TDEE \(Int(safeTDEE)) kcal/day · \(model.confidence)% confidence"
            }
            await syncEngine?.markDirty()
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func upsertSwiftDataMetabolicModel(_ model: MetabolicModelResponse, points: [MetabolicDataPointPayload]) {
        let iso8601 = ISO8601DateFormatter()
        let dataPoints = points.map {
            MetabolicDataPoint(date: $0.date, weightKg: $0.weightKg, totalIntake: $0.totalIntake, totalExpenditure: $0.totalExpenditure)
        }
        let history = model.history.map {
            MetabolicHistoryEntry(date: $0.date, tdee: $0.tdee, confidence: Double($0.confidence))
        }
        let lastUpdated = model.lastUpdated.flatMap { iso8601.date(from: $0) } ?? .now
        for x in (try? context.fetch(FetchDescriptor<MetabolicModel>())) ?? [] {
            context.delete(x)
        }
        context.insert(MetabolicModel(
            estimatedTDEE: model.estimatedTDEE,
            confidence: Double(model.confidence),
            dataPoints: dataPoints,
            lastUpdated: lastUpdated,
            history: history
        ))
        try? context.save()
    }

    private func clampTDEE(_ value: Double) -> Double {
        min(max(value, Self.minReasonableTDEE), Self.maxReasonableTDEE)
    }
}

struct CoachCheckInDashboardCard: View {
    @Environment(\.modelContext) private var context
    @Environment(AuthService.self) private var auth

    @Query(sort: \BiofeedbackEntry.time, order: .reverse) private var biofeedbackEntries: [BiofeedbackEntry]
    @Query(sort: \MealEntry.date, order: .reverse) private var allMeals: [MealEntry]

    @State private var mealService = MealService()
    @State private var planService = PlanService()
    @State private var message: String?
    @State private var tone: String?
    @State private var loading = false

    private var todayKey: String { DateHelpers.todayString() }

    private var latestTodayBio: BiofeedbackEntry? {
        biofeedbackEntries.first { $0.date == todayKey }
    }

    private var mealLoggingStreak: Int {
        let dates = Set(allMeals.map(\.date))
        return DateHelpers.streakLength(dates: Array(dates))
    }

    private var workoutCompletedToday: Bool {
        guard let plan = planService.currentPlan(context: context),
              let idx = planService.todaysWorkoutPlanIndex(context: context),
              let day = planService.todaysWorkout(context: context)
        else { return false }
        return WorkoutService.shared.isWorkoutDayFullyComplete(day, dayKey: todayKey, planIndex: idx, planId: plan.id)
    }

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 8) {
                Text("Ref Check-In")
                    .font(.subheadline.weight(.semibold))

                if loading {
                    ProgressView()
                        .controlSize(.small)
                } else if let message {
                    Text(message)
                        .font(.caption)
                    if let tone {
                        Text(tone.capitalized)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("Get a personalized nudge based on today’s meals, biofeedback, streak, and workout.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Button("Get check-in") {
                    Task { await fetchCheckIn() }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(loading || auth.currentUser == nil)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func fetchCheckIn() async {
        guard let profile = auth.currentUser else { return }
        loading = true
        defer { loading = false }
        let targets = planService.currentPlan(context: context)?.dietPlan.dailyTargets
            ?? Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
        let todayMealCount = mealService.mealsForDate(todayKey, context: context).count
        let bioSnap: CoachBiofeedbackSnapshot? = latestTodayBio.map {
            CoachBiofeedbackSnapshot(
                energy: $0.energy,
                mood: $0.mood,
                hunger: $0.hunger,
                stress: $0.stress,
                soreness: $0.soreness
            )
        }
        let payload = CoachCheckInRequest(
            name: profile.name,
            todayMeals: todayMealCount,
            todayTargets: targets,
            workoutCompleted: workoutCompletedToday,
            streak: mealLoggingStreak,
            biofeedback: bioSnap
        )
        do {
            let res: CoachCheckInResponse = try await APIClient.shared.request(CoachAPI.checkIn(payload: payload))
            message = res.message ?? "Keep going — consistency wins."
            tone = res.tone ?? "encouraging"
        } catch {
            message = "Keep pushing! You've got this."
            tone = "encouraging"
        }
    }
}
