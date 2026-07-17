import Foundation
import SwiftData
import Observation

public struct RegeneratePlanOptions: Sendable {
    public var programWeeks: Int?
    public var workoutDaysPerWeek: Int?
    public var reason: String?

    public init(programWeeks: Int? = nil, workoutDaysPerWeek: Int? = nil, reason: String? = nil) {
        self.programWeeks = programWeeks
        self.workoutDaysPerWeek = workoutDaysPerWeek
        self.reason = reason
    }

    public static let `default` = RegeneratePlanOptions()
}

@MainActor
@Observable
public final class PlanService {
    public private(set) var isGenerating = false
    public private(set) var isAdjusting = false

    private static let minReasonableTDEE = 1200.0
    private static let maxReasonableTDEE = 4500.0

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func generatePlan(
        profile: UserProfileDTO,
        context: ModelContext,
        options: RegeneratePlanOptions = .default
    ) async throws -> FitnessPlan {
        isGenerating = true
        defer { isGenerating = false }

        let totalWeeks = Self.clampProgramWeeks(options.programWeeks ?? 1)
        let daysPerWeek = Self.clampWorkoutDaysPerWeek(
            options.workoutDaysPerWeek ?? profile.workoutDaysPerWeek ?? 4
        )

        var requestProfile = enrichedProfileForGeneration(profile, context: context)
        requestProfile.workoutDaysPerWeek = daysPerWeek
        requestProfile.programWeeks = totalWeeks > 1 ? totalWeeks : nil

        let dto: FitnessPlanDTO = try await api.request(PlanAPI.generate(profile: requestProfile))
        var plan = mapPlan(dto)
        plan.synced = false
        context.insert(plan)
        try? context.save()

        if totalWeeks <= 1 { return plan }

        let template = Self.extractWeek1TrainingTemplate(plan.workoutPlan.weeklyPlan)
        guard !template.isEmpty else {
            throw PlanServiceError.missingTrainingDays
        }

        for range in Self.chunkWeekRanges(totalWeeks: totalWeeks) {
            let profileSlice = GenerateWorkoutsProfile(
                name: profile.name,
                goal: profile.goal,
                fitnessLevel: profile.fitnessLevel,
                workoutLocation: profile.workoutLocation,
                workoutEquipment: profile.workoutEquipment,
                injuriesOrLimitations: profile.injuriesOrLimitations,
                workoutDaysPerWeek: daysPerWeek
            )
            let chunk: GenerateWorkoutsResponse = try await api.request(
                PlanAPI.generateWorkouts(
                    GenerateWorkoutsRequest(
                        fromWeek: range.from,
                        toWeek: range.to,
                        programWeeks: totalWeeks,
                        workoutDaysPerWeek: daysPerWeek,
                        week1Template: template,
                        reason: options.reason,
                        profile: profileSlice
                    )
                )
            )
            plan.workoutPlan.weeklyPlan.append(contentsOf: chunk.workoutDays)
            plan.synced = false
            try? context.save()
        }

        plan.workoutPlan = WorkoutImportStart.workoutPlanAfterImport(
            weeklyPlan: plan.workoutPlan.weeklyPlan,
            preserving: plan.workoutPlan
        )
        plan.synced = false
        try? context.save()

        return plan
    }

    public func generatePlan(profile: UserProfileDTO, context: ModelContext) async throws -> FitnessPlan {
        try await generatePlan(profile: profile, context: context, options: .default)
    }

    /// Replaces any existing plan with a freshly AI-generated diet + workout plan (web dashboard parity).
    public func regeneratePlan(
        context: ModelContext,
        options: RegeneratePlanOptions = .default
    ) async throws -> FitnessPlan {
        guard let profile = currentProfile(context: context) else {
            throw PlanServiceError.missingProfile
        }
        let iso = ISO8601DateFormatter()
        var profileDTO = profile.toDTO(createdAtISO: iso.string(from: profile.createdAt))
        if let days = options.workoutDaysPerWeek {
            profileDTO.workoutDaysPerWeek = days
        }

        let existing = (try? context.fetch(FetchDescriptor<FitnessPlan>())) ?? []
        for plan in existing {
            context.delete(plan)
        }
        try? context.save()

        return try await generatePlan(profile: profileDTO, context: context, options: options)
    }

    private func enrichedProfileForGeneration(_ profile: UserProfileDTO, context: ModelContext) -> UserProfileDTO {
        var requestProfile = profile

        if let model = highestConfidenceMetabolicModel(context: context), model.confidence >= 70 {
            requestProfile.learnedTDEE = clampTDEE(model.estimatedTDEE)
        } else if let cached = MetabolicModelStorage.load(), cached.confidence >= 70 {
            requestProfile.learnedTDEE = clampTDEE(cached.estimatedTDEE)
        }

        if let targets = MeasurementTargetsStorage.load() {
            let hasAnyTarget = targets.targetWeightLbs != nil || targets.targetBodyFatPercent != nil || targets.targetMuscleMassLbs != nil
            if hasAnyTarget {
                requestProfile.measurementTargets = MeasurementTargetsDTO(
                    targetWeightLbs: targets.targetWeightLbs,
                    targetBodyFatPercent: targets.targetBodyFatPercent,
                    targetMuscleMassLbs: targets.targetMuscleMassLbs
                )
            }
        }

        let latestComposition = latestBodyComposition(context: context)
        requestProfile.currentBodyFatPercent = latestComposition.currentBodyFatPercent
        requestProfile.currentMuscleMassLbs = latestComposition.currentMuscleMassLbs
        return requestProfile
    }

    private func currentProfile(context: ModelContext) -> UserProfile? {
        (try? context.fetch(FetchDescriptor<UserProfile>()))?.first
    }

    public func adjustPlan(
        feedback: String,
        currentPlan: FitnessPlanDTO?,
        context: ModelContext
    ) async throws -> AdjustSuggestion {
        isAdjusting = true
        defer { isAdjusting = false }

        let meals = mealsLoggedThisWeek(context: context)
        let mealDTOs = meals.map {
            AdjustMealDTO(
                date: $0.date,
                name: $0.name,
                mealType: $0.mealType.rawValue,
                calories: Double($0.macros.calories),
                protein: $0.macros.protein,
                carbs: $0.macros.carbs,
                fat: $0.macros.fat
            )
        }

        // Average across a 7-day window so partial logging still reads as a daily average (matches web behavior).
        let avgCalories: Double? = meals.isEmpty
            ? nil
            : meals.reduce(0.0) { $0 + Double($1.macros.calories) } / 7.0
        let avgProtein: Double? = meals.isEmpty
            ? nil
            : meals.reduce(0.0) { $0 + $1.macros.protein } / 7.0

        let response: AdjustResponse = try await api.request(
            PlanAPI.adjust(
                feedback: feedback,
                currentPlan: currentPlan,
                mealsThisWeek: mealDTOs,
                avgDailyCalories: avgCalories,
                avgDailyProtein: avgProtein
            )
        )
        return response.suggestion
    }

    /// `MealEntry` rows logged within the last 7 calendar days (inclusive of today).
    /// Dates are stored as `yyyy-MM-dd`, so a lexicographic `>=` against the cutoff is a valid date comparison.
    private func mealsLoggedThisWeek(context: ModelContext) -> [MealEntry] {
        let cutoffDate = Calendar.current.date(byAdding: .day, value: -6, to: .now) ?? .now
        let cutoff = DateHelpers.dateString(from: cutoffDate)
        let descriptor = FetchDescriptor<MealEntry>(
            predicate: #Predicate { $0.date >= cutoff },
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    public func adjustSchedule(
        plan: FitnessPlan,
        action: ScheduleAction? = nil,
        progress: [String: String] = [:],
        useAiRecommendation: Bool = false
    ) async throws -> ScheduleAdjustResponse {
        isAdjusting = true
        defer { isAdjusting = false }

        let iso = ISO8601DateFormatter()
        let dto = FitnessPlanDTO(from: plan, iso8601: iso)
        return try await api.request(
            PlanAPI.adjustSchedule(
                payload: ScheduleAdjustPayload(
                    plan: dto,
                    action: action,
                    workoutProgress: progress.isEmpty ? nil : progress,
                    useAiRecommendation: useAiRecommendation,
                    today: DateHelpers.todayString()
                )
            )
        )
    }

    public func applyScheduleResponse(_ response: ScheduleAdjustResponse, to plan: FitnessPlan) {
        plan.workoutPlan.weeklyPlan = response.workoutPlan.weeklyPlan
        plan.workoutPlan.tips = response.workoutPlan.tips
        plan.workoutPlan.programWeek1Start = response.workoutPlan.programWeek1Start
        plan.workoutPlan.advancementMode = response.workoutPlan.advancementMode
        plan.workoutPlan.programWeekOffset = response.workoutPlan.programWeekOffset
        plan.workoutPlan.pausedUntil = response.workoutPlan.pausedUntil
        plan.workoutPlan.missedSessions = response.workoutPlan.missedSessions
        plan.workoutPlan.catchUpBannerDismissedAt = response.workoutPlan.catchUpBannerDismissedAt
        plan.synced = false
    }

    public func dismissCatchUpBanner(on plan: FitnessPlan) {
        plan.workoutPlan = WorkoutScheduleService.dismissCatchUpBanner(plan: plan).workoutPlan
        plan.synced = false
    }

    public func applyLocalScheduleAction(
        action: ScheduleAction,
        to plan: FitnessPlan,
        progress: [String: String]
    ) -> String {
        let result = WorkoutScheduleService.applyScheduleAction(
            plan: plan,
            action: action,
            progress: progress
        )
        plan.workoutPlan = result.workoutPlan
        plan.synced = false
        return result.summary
    }

    /// Returns macro targets for a calendar day — training targets on workout days, rest targets on rest days, falling back to `dailyTargets`.
    public func targets(for date: Date, context: ModelContext) -> Macros {
        let fallback = Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
        guard let plan = currentPlan(context: context) else { return fallback }
        if let workout = workout(for: date, context: context) {
            let f = workout.focus.lowercased()
            let isRest = f.contains("rest") || f.contains("recovery") || f.contains("off")
            if isRest, let t = plan.dietPlan.restTargets, t.calories > 0 { return t }
            if !isRest, let t = plan.dietPlan.trainingTargets, t.calories > 0 { return t }
        } else if let t = plan.dietPlan.restTargets, t.calories > 0 {
            return t
        }
        let daily = plan.dietPlan.dailyTargets
        return daily.calories > 0 ? daily : fallback
    }

    /// Returns today's macro target — training targets on workout days, rest targets on rest days, falling back to `dailyTargets`.
    public func todaysTargets(context: ModelContext) -> Macros {
        targets(for: .now, context: context)
    }

    /// Sets `dailyTargets` and re-derives the training/rest split (±200 kcal / ±50g carbs) from the new base.
    public func applyBaseTargets(_ targets: Macros, to plan: FitnessPlan) {
        plan.dietPlan.dailyTargets = targets
        let carbSwing: Double = 50
        plan.dietPlan.trainingTargets = Macros(
            calories: targets.calories + 200,
            protein: targets.protein,
            carbs: targets.carbs + carbSwing,
            fat: targets.fat
        )
        plan.dietPlan.restTargets = Macros(
            calories: targets.calories - 200,
            protein: targets.protein,
            carbs: max(0, targets.carbs - carbSwing),
            fat: targets.fat
        )
        plan.synced = false
    }

    /// Recalculates macro targets from a learned/adaptive TDEE via `/api/macros/calculate`
    /// (same calculator the server uses for plan generation) and applies them to the current
    /// plan. Returns the new base targets, or `nil` when no plan exists yet.
    /// Caller triggers sync after a successful apply.
    public func applyLearnedTDEEToTargets(
        _ estimatedTDEE: Double,
        profile: UserProfileDTO,
        context: ModelContext
    ) async throws -> Macros? {
        guard let plan = currentPlan(context: context) else { return nil }

        var requestProfile = profile
        requestProfile.learnedTDEE = clampTDEE(estimatedTDEE)

        if let targets = MeasurementTargetsStorage.load() {
            let hasAnyTarget = targets.targetWeightLbs != nil || targets.targetBodyFatPercent != nil || targets.targetMuscleMassLbs != nil
            if hasAnyTarget {
                requestProfile.measurementTargets = MeasurementTargetsDTO(
                    targetWeightLbs: targets.targetWeightLbs,
                    targetBodyFatPercent: targets.targetBodyFatPercent,
                    targetMuscleMassLbs: targets.targetMuscleMassLbs
                )
            }
        }
        let latestComposition = latestBodyComposition(context: context)
        requestProfile.currentBodyFatPercent = latestComposition.currentBodyFatPercent
        requestProfile.currentMuscleMassLbs = latestComposition.currentMuscleMassLbs

        let response: MacrosCalculateResponse = try await api.request(MiscAPI.macrosCalculate(profile: requestProfile))
        applyBaseTargets(response.macros, to: plan)
        try? context.save()
        return response.macros
    }

    /// Applies AI adjustment targets to the in-memory plan. Caller must `save` the `ModelContext` and trigger sync.
    public func applyAdjustSuggestion(_ suggestion: AdjustSuggestion, to plan: FitnessPlan) {
        if let targets = suggestion.newTargets {
            applyBaseTargets(targets, to: plan)
        }
        let note: String
        if let changes = suggestion.changes, !changes.isEmpty {
            note = changes.joined(separator: "; ")
        } else {
            note = suggestion.explanation
        }
        if let existing = plan.reasoning, !existing.isEmpty {
            plan.reasoning = existing + "\n\n[Adjusted] " + note
        } else {
            plan.reasoning = "[Adjusted] " + note
        }
        plan.synced = false
    }

    public func currentPlan(context: ModelContext) -> FitnessPlan? {
        let descriptor = FetchDescriptor<FitnessPlan>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return try? context.fetch(descriptor).first
    }

    public func todaysWorkout(context: ModelContext) -> WorkoutDay? {
        workout(for: .now, context: context)
    }

    public func workout(for date: Date, context: ModelContext) -> WorkoutDay? {
        guard let plan = currentPlan(context: context) else { return nil }
        guard let idx = WorkoutProgramSchedule.planIndex(for: plan, date: date) else { return nil }
        let weeklyPlan = plan.workoutPlan.weeklyPlan
        guard idx < weeklyPlan.count else { return nil }
        return weeklyPlan[idx]
    }

    /// `weeklyPlan` index for `todaysWorkout` (needed for scoped set progress keys).
    public func todaysWorkoutPlanIndex(context: ModelContext) -> Int? {
        guard let plan = currentPlan(context: context) else { return nil }
        guard let idx = WorkoutProgramSchedule.planIndex(for: plan, date: .now) else { return nil }
        guard idx < plan.workoutPlan.weeklyPlan.count else { return nil }
        return idx
    }

    private func mapPlan(_ dto: FitnessPlanDTO) -> FitnessPlan {
        FitnessPlan(
            id: dto.id,
            userId: dto.userId,
            dietPlan: DietPlan(
                dailyTargets: dto.dietPlan.dailyTargets,
                trainingTargets: dto.dietPlan.trainingTargets,
                restTargets: dto.dietPlan.restTargets,
                weeklyPlan: dto.dietPlan.weeklyPlan,
                tips: dto.dietPlan.tips
            ),
            workoutPlan: WorkoutPlan(
                weeklyPlan: dto.workoutPlan.weeklyPlan,
                tips: dto.workoutPlan.tips,
                programWeek1Start: dto.workoutPlan.programWeek1Start,
                advancementMode: dto.workoutPlan.advancementMode,
                programWeekOffset: dto.workoutPlan.programWeekOffset,
                pausedUntil: dto.workoutPlan.pausedUntil,
                missedSessions: dto.workoutPlan.missedSessions,
                catchUpBannerDismissedAt: dto.workoutPlan.catchUpBannerDismissedAt
            ),
            reasoning: dto.reasoning
        )
    }

    private func highestConfidenceMetabolicModel(context: ModelContext) -> MetabolicModel? {
        let models = (try? context.fetch(FetchDescriptor<MetabolicModel>())) ?? []
        return models.max(by: { $0.confidence < $1.confidence })
    }

    private func latestBodyComposition(context: ModelContext) -> (currentBodyFatPercent: Double?, currentMuscleMassLbs: Double?) {
        let rows = (try? context.fetch(FetchDescriptor<WearableDaySummary>())) ?? []
        if rows.isEmpty { return (nil, nil) }
        let sorted = rows.sorted { $0.date > $1.date }
        let bodyFat = sorted.first(where: { $0.bodyFatPercent != nil })?.bodyFatPercent
        let muscle = sorted.first(where: { $0.muscleMass != nil })?.muscleMass
        return (bodyFat, muscle)
    }

    private func clampTDEE(_ value: Double) -> Double {
        min(max(value, Self.minReasonableTDEE), Self.maxReasonableTDEE)
    }

    private static let maxProgramWeeks = 12
    private static let weeksPerChunk = 2

    private static func clampProgramWeeks(_ weeks: Int) -> Int {
        min(maxProgramWeeks, max(1, weeks))
    }

    private static func clampWorkoutDaysPerWeek(_ days: Int) -> Int {
        min(7, max(2, days))
    }

    private static func extractWeek1TrainingTemplate(_ weeklyPlan: [WorkoutDay]) -> [WorkoutDay] {
        weeklyPlan.filter { day in
            let focus = day.focus.lowercased()
            let isRecovery =
                focus.contains("recovery") ||
                focus.contains("mobility") ||
                focus.contains("rest") ||
                focus.contains("off day")
            return !day.exercises.isEmpty && !isRecovery
        }
    }

    private static func chunkWeekRanges(totalWeeks: Int) -> [(from: Int, to: Int)] {
        var ranges: [(from: Int, to: Int)] = []
        var from = 2
        while from <= totalWeeks {
            let to = min(from + weeksPerChunk - 1, totalWeeks)
            ranges.append((from, to))
            from = to + 1
        }
        return ranges
    }
}

public enum PlanServiceError: LocalizedError, Sendable {
    case missingProfile
    case missingTrainingDays

    public var errorDescription: String? {
        switch self {
        case .missingProfile:
            return "Complete your profile before generating a plan."
        case .missingTrainingDays:
            return "Week 1 has no training days to extend into a multi-week program."
        }
    }
}
