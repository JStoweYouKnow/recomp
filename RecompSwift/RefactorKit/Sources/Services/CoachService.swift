import Foundation
import SwiftData
import Observation
import os.log

@MainActor
@Observable
public final class CoachService {
    private static let logger = Logger(subsystem: "com.refactor.app", category: "CoachService")

    public private(set) var messages: [CoachMessage] = []
    public private(set) var isResponding = false
    public private(set) var shouldRegeneratePlan = false
    public private(set) var pendingRegenerateOptions = RegeneratePlanOptions.default

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func loadHistory(context: ModelContext) {
        let descriptor = FetchDescriptor<CoachMessage>(
            sortBy: [SortDescriptor(\.timestamp)]
        )
        messages = ((try? context.fetch(descriptor)) ?? []).map { message in
            guard message.role == .assistant else { return message }
            let cleaned = RicoReplySanitizer.stripDiagnosticMarkup(message.content)
            guard cleaned != message.content else { return message }
            message.content = cleaned
            return message
        }
        try? context.save()
    }

    public func sendMessage(_ text: String, context: ModelContext) async throws {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let userMessage = CoachMessage(role: .user, content: trimmed)
        context.insert(userMessage)
        messages.append(userMessage)

        isResponding = true
        defer { isResponding = false }
        shouldRegeneratePlan = false
        pendingRegenerateOptions = .default

        let historyDTOs = messages.map { msg in
            let content = msg.role == .assistant
                ? RicoReplySanitizer.stripDiagnosticMarkup(msg.content)
                : msg.content
            return CoachMessageDTO(
                role: msg.role == .user ? "user" : "assistant",
                content: content,
                at: ISO8601DateFormatter().string(from: msg.timestamp)
            )
        }

        let ricoContext = buildRicoContext(modelContext: context)

        let response: CoachChatResponse
        do {
            response = try await api.request(
                CoachAPI.chat(message: trimmed, history: historyDTOs, context: ricoContext)
            )
        } catch {
            context.delete(userMessage)
            messages.removeAll { $0.id == userMessage.id }
            throw error
        }

        var replyText = RicoReplySanitizer.stripDiagnosticMarkup(
            response.reply.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        if let suggestions = response.recipeSuggestions, !suggestions.isEmpty {
            replyText += Self.formatRecipeSuggestions(suggestions)
        }

        if let saved = response.recipeSaved {
            let record = SavedRecipeRecord(
                id: saved.id,
                name: saved.name,
                description: saved.description,
                calories: saved.calories,
                protein: saved.protein,
                carbs: saved.carbs,
                fat: saved.fat,
                recipeUrl: saved.recipeUrl,
                source: saved.source,
                mealTypes: saved.mealTypes,
                servings: saved.servings,
                addedAt: saved.addedAt
            )
            SavedRecipesStorage.append(record)
            NotificationCenter.default.post(name: .recompSchedulePushSync, object: nil)
        }

        var applyResult = RicoApplyResult()
        if !response.actions.isEmpty {
            applyResult = applyActions(response.actions, modelContext: context)
        }

        if let suffix = applyResult.statusSuffix {
            replyText += suffix
        } else if Self.replyClaimsMealLogged(replyText), !applyResult.touchedMeals {
            replyText +=
                "\n\nThat meal wasn't saved — Ref didn't return a log action. Try again or add it manually in Meals."
        }

        let assistantMessage = CoachMessage(role: .assistant, content: replyText)
        context.insert(assistantMessage)
        messages.append(assistantMessage)

        try context.save()
        commitCoachTurn(context: context, applyResult: applyResult)
    }

    public func clearHistory(context: ModelContext) {
        for message in messages {
            context.delete(message)
        }
        messages.removeAll()
        try? context.save()
        CoachHistoryStore.mergeIntoDefaults(container: context.container)
    }

    /// Save → notify dependent UI → merge chat history for the next sync push.
    private func commitCoachTurn(context: ModelContext, applyResult: RicoApplyResult) {
        shouldRegeneratePlan = applyResult.shouldRegeneratePlan
        pendingRegenerateOptions = applyResult.pendingRegenerateOptions
        CoachHistoryStore.mergeIntoDefaults(container: context.container)
        if applyResult.touchedMeals {
            MealChangeNotifier.postLocalMealsChanged()
        }
        if applyResult.touchedPlan {
            PlanChangeNotifier.postLocalPlanChanged()
        }
    }

    // MARK: - Context Building

    private func buildRicoContext(modelContext: ModelContext) -> RicoContextPayload {
        let profile = fetchLatest(UserProfile.self, modelContext: modelContext)
        let today = DateHelpers.todayString()

        let todayDescriptor = FetchDescriptor<MealEntry>(
            predicate: #Predicate { $0.date == today }
        )
        let todayMeals = (try? modelContext.fetch(todayDescriptor)) ?? []

        let allDescriptor = FetchDescriptor<MealEntry>()
        let allMeals = (try? modelContext.fetch(allDescriptor)) ?? []
        let allMealDates = Array(Set(allMeals.map { $0.date }))

        let streak = DateHelpers.streakLength(dates: allMealDates)

        let plan = fetchLatestPlan(modelContext: modelContext)
        let workoutPlanPayload = plan.map { p in
            RicoWorkoutPlanPayload(
                weeklyPlan: p.workoutPlan.weeklyPlan.map { day in
                    RicoWorkoutDayPayload(
                        day: day.day,
                        focus: day.focus,
                        warmups: day.warmups?.map { toExercisePayload($0) },
                        exercises: day.exercises.map { toExercisePayload($0) },
                        finishers: day.finishers?.map { toExercisePayload($0) }
                    )
                }
            )
        }

        let recentMeals: [RicoMealSummary]? = todayMeals.isEmpty ? nil : todayMeals.map {
            RicoMealSummary(
                name: $0.name,
                mealType: $0.mealType.rawValue,
                calories: Double($0.macros.calories),
                protein: $0.macros.protein,
                carbs: $0.macros.carbs,
                fat: $0.macros.fat
            )
        }

        let todayMacros: RicoMacroSummary? = todayMeals.isEmpty ? nil : {
            let cal = todayMeals.reduce(0.0) { $0 + Double($1.macros.calories) }
            let pro = todayMeals.reduce(0.0) { $0 + $1.macros.protein }
            let carb = todayMeals.reduce(0.0) { $0 + $1.macros.carbs }
            let fat = todayMeals.reduce(0.0) { $0 + $1.macros.fat }
            return RicoMacroSummary(calories: cal, protein: pro, carbs: carb, fat: fat)
        }()

        let macroTargets: RicoMacroSummary? = plan.map {
            let t = $0.dietPlan.dailyTargets
            return RicoMacroSummary(calories: Double(t.calories), protein: t.protein, carbs: t.carbs, fat: t.fat)
        }

        let remainingMacros: RicoMacroSummary? = {
            guard let targets = macroTargets, let consumed = todayMacros else { return nil }
            return RicoMacroSummary(
                calories: max(0, targets.calories - consumed.calories),
                protein: max(0, targets.protein - consumed.protein),
                carbs: max(0, targets.carbs - consumed.carbs),
                fat: max(0, targets.fat - consumed.fat)
            )
        }()

        let savedRecords = SavedRecipesStorage.load()
        let savedRecipeDTOs: [SavedRecipeDTO]? = savedRecords.isEmpty ? nil : savedRecords.prefix(30).map {
            SavedRecipeDTO(
                id: $0.id,
                name: $0.name,
                description: $0.description,
                calories: $0.calories,
                protein: $0.protein,
                carbs: $0.carbs,
                fat: $0.fat,
                recipeUrl: $0.recipeUrl,
                source: $0.source,
                mealTypes: $0.mealTypes,
                servings: $0.servings,
                addedAt: $0.addedAt
            )
        }

        let weightDescriptor = FetchDescriptor<WearableDaySummary>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        let latestWeight = (try? modelContext.fetch(weightDescriptor))?.first(where: { $0.weight != nil })?.weight

        return RicoContextPayload(
            name: profile?.name,
            goal: profile?.goal.rawValue,
            streak: streak,
            mealsLogged: todayMeals.count,
            workoutPlan: workoutPlanPayload,
            equipment: profile.flatMap { $0.workoutEquipment.isEmpty ? nil : $0.workoutEquipment.map { $0.rawValue } },
            injuries: profile.flatMap { $0.injuriesOrLimitations.isEmpty ? nil : $0.injuriesOrLimitations },
            dietaryRestrictions: profile.flatMap { $0.dietaryRestrictions.isEmpty ? nil : $0.dietaryRestrictions },
            recentMeals: recentMeals,
            todayMacros: todayMacros,
            macroTargets: macroTargets,
            remainingMacros: remainingMacros,
            savedRecipeCount: savedRecords.isEmpty ? nil : savedRecords.count,
            savedRecipeNames: savedRecords.isEmpty ? nil : savedRecords.prefix(8).map(\.name),
            savedRecipes: savedRecipeDTOs,
            bodyWeight: latestWeight
        )
    }

    private static func formatRecipeSuggestions(_ suggestions: [ScoredRecipeSuggestion]) -> String {
        guard !suggestions.isEmpty else { return "" }
        let lines = suggestions.enumerated().map { index, s in
            let link = s.recipeUrl.map { " \($0)" } ?? ""
            return "\(index + 1). \(s.name) (\(s.calories) cal, \(s.protein)g P, score \(s.fitScore)) — \(s.fitReason)\(link)"
        }
        return "\n\n" + lines.joined(separator: "\n")
    }

    /// Model sometimes replies "I've logged …" in plain text without calling `log_meal`.
    private static func replyClaimsMealLogged(_ reply: String) -> Bool {
        let lower = reply.lowercased()
        return lower.contains("i've logged") || lower.contains("i logged") || lower.contains("logged your meal")
    }

    private func toExercisePayload(_ ex: WorkoutExercise) -> RicoExercisePayload {
        RicoExercisePayload(name: ex.name, sets: ex.sets, reps: ex.reps, notes: ex.notes)
    }

    // MARK: - Action Application

    @discardableResult
    private func applyActions(_ actions: [RicoAction], modelContext: ModelContext) -> RicoApplyResult {
        var result = RicoApplyResult()

        for action in actions {
            switch action {
            case .logMeal(let payload):
                let syncKey = "\(payload.resolvedDate)#\(payload.resolvedId)"
                var descriptor = FetchDescriptor<MealEntry>(
                    predicate: #Predicate { $0.syncKey == syncKey }
                )
                descriptor.fetchLimit = 1
                if (try? modelContext.fetch(descriptor))?.first != nil {
                    result.touchedMeals = true
                    result.recordApplied("log_meal")
                    continue
                }
                let entry = MealEntry(
                    id: payload.resolvedId,
                    date: payload.resolvedDate,
                    mealType: payload.mealType ?? .snack,
                    name: payload.name,
                    macros: payload.asMacros,
                    synced: false
                )
                modelContext.insert(entry)
                result.touchedMeals = true
                result.recordApplied("log_meal")

            case .updateMacros(let payload):
                guard let plan = fetchLatestPlan(modelContext: modelContext) else {
                    result.recordSkipped(type: "update_macros", reason: "no plan")
                    continue
                }
                plan.dietPlan.dailyTargets = payload.asMacros
                plan.synced = false
                result.touchedPlan = true
                result.recordApplied("update_macros")

            case .swapExercise(let payload):
                guard let plan = fetchLatestPlan(modelContext: modelContext) else {
                    result.recordSkipped(type: "swap_exercise", reason: "no plan")
                    continue
                }
                var weeklyPlan = plan.workoutPlan.weeklyPlan
                guard let dayIdx = weeklyPlan.firstIndex(where: {
                    $0.day.lowercased() == payload.day.lowercased()
                }) else {
                    result.recordSkipped(type: "swap_exercise", reason: "day not found: \(payload.day)")
                    continue
                }

                var day = weeklyPlan[dayIdx]
                let newEx = WorkoutExercise(
                    name: payload.newExerciseName,
                    sets: payload.newSets,
                    reps: payload.newReps,
                    notes: payload.newNotes
                )
                let section = payload.section ?? "exercises"
                var swapped = false
                switch section {
                case "warmups":
                    if let idx = day.warmups?.firstIndex(where: {
                        $0.name.lowercased() == payload.oldExerciseName.lowercased()
                    }) {
                        day.warmups?[idx] = newEx
                        swapped = true
                    }
                case "finishers":
                    if let idx = day.finishers?.firstIndex(where: {
                        $0.name.lowercased() == payload.oldExerciseName.lowercased()
                    }) {
                        day.finishers?[idx] = newEx
                        swapped = true
                    }
                default:
                    if let idx = day.exercises.firstIndex(where: {
                        $0.name.lowercased() == payload.oldExerciseName.lowercased()
                    }) {
                        day.exercises[idx] = newEx
                        swapped = true
                    }
                }
                guard swapped else {
                    result.recordSkipped(type: "swap_exercise", reason: "exercise not found: \(payload.oldExerciseName)")
                    continue
                }
                weeklyPlan[dayIdx] = day
                plan.workoutPlan = WorkoutPlan(
                    weeklyPlan: weeklyPlan,
                    tips: plan.workoutPlan.tips,
                    programWeek1Start: plan.workoutPlan.programWeek1Start
                )
                plan.synced = false
                result.touchedPlan = true
                result.recordApplied("swap_exercise")

            case .addExercise(let payload):
                guard let plan = fetchLatestPlan(modelContext: modelContext) else {
                    result.recordSkipped(type: "add_exercise", reason: "no plan")
                    continue
                }
                var weeklyPlan = plan.workoutPlan.weeklyPlan
                guard let dayIdx = weeklyPlan.firstIndex(where: {
                    $0.day.lowercased() == payload.day.lowercased()
                }) else {
                    result.recordSkipped(type: "add_exercise", reason: "day not found: \(payload.day)")
                    continue
                }

                var day = weeklyPlan[dayIdx]
                let newEx = WorkoutExercise(
                    name: payload.exerciseName,
                    sets: payload.sets,
                    reps: payload.reps,
                    notes: payload.notes
                )
                let section = payload.section ?? "exercises"
                switch section {
                case "warmups":
                    if day.warmups == nil { day.warmups = [] }
                    day.warmups?.append(newEx)
                case "finishers":
                    if day.finishers == nil { day.finishers = [] }
                    day.finishers?.append(newEx)
                default:
                    day.exercises.append(newEx)
                }
                weeklyPlan[dayIdx] = day
                plan.workoutPlan = WorkoutPlan(
                    weeklyPlan: weeklyPlan,
                    tips: plan.workoutPlan.tips,
                    programWeek1Start: plan.workoutPlan.programWeek1Start
                )
                plan.synced = false
                result.touchedPlan = true
                result.recordApplied("add_exercise")

            case .updateWorkoutDay(let payload):
                guard let plan = fetchLatestPlan(modelContext: modelContext) else {
                    result.recordSkipped(type: "update_workout_day", reason: "no plan")
                    continue
                }
                var weeklyPlan = plan.workoutPlan.weeklyPlan
                guard let dayIdx = weeklyPlan.firstIndex(where: {
                    $0.day.lowercased() == payload.day.lowercased()
                }) else {
                    result.recordSkipped(type: "update_workout_day", reason: "day not found: \(payload.day)")
                    continue
                }

                var day = weeklyPlan[dayIdx]
                day.focus = payload.focus
                if let warmups = payload.warmups {
                    day.warmups = warmups.map {
                        WorkoutExercise(name: $0.name, sets: $0.sets, reps: $0.reps, notes: $0.notes)
                    }
                }
                if let exercises = payload.exercises {
                    day.exercises = exercises.map {
                        WorkoutExercise(name: $0.name, sets: $0.sets, reps: $0.reps, notes: $0.notes)
                    }
                }
                if let finishers = payload.finishers {
                    day.finishers = finishers.isEmpty ? nil : finishers.map {
                        WorkoutExercise(name: $0.name, sets: $0.sets, reps: $0.reps, notes: $0.notes)
                    }
                }
                weeklyPlan[dayIdx] = day
                plan.workoutPlan = WorkoutPlan(
                    weeklyPlan: weeklyPlan,
                    tips: plan.workoutPlan.tips,
                    programWeek1Start: plan.workoutPlan.programWeek1Start
                )
                plan.synced = false
                result.touchedPlan = true
                result.recordApplied("update_workout_day")

            case .regeneratePlan(let payload):
                result.shouldRegeneratePlan = true
                result.pendingRegenerateOptions = RegeneratePlanOptions(
                    programWeeks: payload.programWeeks,
                    workoutDaysPerWeek: payload.workoutDaysPerWeek,
                    reason: payload.reason
                )
                result.recordApplied("regenerate_plan")

            case .adjustProgramStart(let payload):
                guard let plan = fetchLatestPlan(modelContext: modelContext) else {
                    result.recordSkipped(type: "adjust_program_start", reason: "no plan")
                    continue
                }
                plan.workoutPlan.programWeek1Start = DateHelpers.mondayWeekStartString(
                    containingCalendarDay: payload.startDate
                )
                plan.workoutPlan.programWeekOffset = 0
                plan.workoutPlan.missedSessions = []
                plan.workoutPlan.catchUpBannerDismissedAt = nil
                plan.synced = false
                result.touchedPlan = true
                result.recordApplied("adjust_program_start")

            case .unknown(let actionType):
                result.recordSkipped(type: actionType, reason: "unsupported action")
                Self.logger.warning("Unhandled Rico action type: \(actionType, privacy: .public)")
            }
        }

        for skip in result.skipped {
            Self.logger.info(
                "Rico action skipped type=\(skip.type, privacy: .public) reason=\(skip.reason, privacy: .public)"
            )
        }

        return result
    }

    // MARK: - Helpers

    private func fetchLatest<T: PersistentModel>(_ type: T.Type, modelContext: ModelContext) -> T? {
        let descriptor = FetchDescriptor<T>()
        return try? modelContext.fetch(descriptor).first
    }

    private func fetchLatestPlan(modelContext: ModelContext) -> FitnessPlan? {
        let descriptor = FetchDescriptor<FitnessPlan>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return try? modelContext.fetch(descriptor).first
    }
}
