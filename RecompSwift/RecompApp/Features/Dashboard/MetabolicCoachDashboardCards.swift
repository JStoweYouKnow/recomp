import SwiftUI
import SwiftData
import RefactorKit

struct MetabolicModelDashboardCard: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Query(sort: \MealEntry.date, order: .reverse) private var meals: [MealEntry]
    @Query(sort: \WearableDaySummary.date, order: .reverse) private var wearables: [WearableDaySummary]
    @Environment(AuthService.self) private var auth

    @State private var planService = PlanService()
    @State private var isUpdating = false
    @State private var errorText: String?
    @State private var resultSummary: String?
    @State private var showExplainer = false

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
        .onAppear {
            if resultSummary == nil, let cached = MetabolicModelStorage.load() {
                resultSummary =
                    "Last estimate: \(Int(cached.estimatedTDEE)) kcal/day · \(cached.confidence)% confidence " +
                    "(\(cached.dataPointCount) pts)"
            }
        }
    }

    private func refreshModel() async {
        isUpdating = true
        errorText = nil
        defer { isUpdating = false }

        let plan = planService.currentPlan(context: context)
        let targets = plan?.dietPlan.dailyTargets ?? Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
        let baseWeightKg = auth.currentUser?.weight ?? 75

        var byDate: [String: (intake: Double, weightKg: Double?, expenditure: Double?)] = [:]
        for m in meals.prefix(400) {
            var cur = byDate[m.date] ?? (0, nil, nil)
            cur.intake += Double(m.macros.calories)
            byDate[m.date] = cur
        }
        for w in wearables.prefix(120) {
            var cur = byDate[w.date] ?? (0, nil, nil)
            if let lbs = w.weight {
                cur.weightKg = lbs * 0.45359237
            }
            cur.expenditure = w.caloriesBurned
            byDate[w.date] = cur
        }

        var prevWeight = baseWeightKg
        let sortedDates = byDate.keys.sorted()
        var points: [MetabolicDataPointPayload] = []
        for d in sortedDates {
            guard let row = byDate[d], row.intake > 0 else { continue }
            let wKg = row.weightKg ?? prevWeight
            if let w = row.weightKg { prevWeight = w }
            let expenditure = row.expenditure ?? Double(targets.calories)
            points.append(
                MetabolicDataPointPayload(
                    date: d,
                    weightKg: wKg,
                    totalIntake: row.intake,
                    totalExpenditure: expenditure
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
                MetabolicHistoryEntry(date: $0.date, tdee: $0.tdee, confidence: $0.confidence)
            }
            let payload = MetabolicBatchUpdatePayload(dataPoints: points, currentTDEE: targets.calories, history: historyPayload)
            let model: MetabolicModelResponse = try await APIClient.shared.request(MiscAPI.metabolicUpdate(payload: payload))
            MetabolicModelStorage.save(model, dataPointCount: points.count)
            if let msg = model.message, !msg.isEmpty {
                resultSummary =
                    "\(Int(model.estimatedTDEE)) kcal/day · \(model.confidence)% — \(msg)"
            } else {
                resultSummary =
                    "Estimated TDEE \(Int(model.estimatedTDEE)) kcal/day · \(model.confidence)% confidence"
            }
            await syncEngine?.markDirty()
        } catch {
            errorText = error.localizedDescription
        }
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
