import Foundation
import SwiftData
import Observation

@MainActor
@Observable
public final class CoachService {
    public private(set) var messages: [CoachMessage] = []
    public private(set) var isResponding = false

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func loadHistory(context: ModelContext) {
        let descriptor = FetchDescriptor<CoachMessage>(
            sortBy: [SortDescriptor(\.timestamp)]
        )
        messages = (try? context.fetch(descriptor)) ?? []
    }

    public func sendMessage(_ text: String, context: ModelContext) async throws {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let userMessage = CoachMessage(role: .user, content: trimmed)
        context.insert(userMessage)
        messages.append(userMessage)

        isResponding = true
        defer { isResponding = false }

        let historyDTOs = messages.map { msg in
            CoachMessageDTO(
                role: msg.role == .user ? "user" : "assistant",
                content: msg.content,
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

        let assistantMessage = CoachMessage(role: .assistant, content: response.reply)
        context.insert(assistantMessage)
        messages.append(assistantMessage)

        if !response.actions.isEmpty {
            applyActions(response.actions, modelContext: context)
        }

        try context.save()
    }

    public func clearHistory(context: ModelContext) {
        for message in messages {
            context.delete(message)
        }
        messages.removeAll()
        try? context.save()
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

        return RicoContextPayload(
            name: profile?.name,
            goal: profile?.goal.rawValue,
            streak: streak,
            mealsLogged: todayMeals.count,
            workoutPlan: workoutPlanPayload,
            equipment: profile.flatMap { $0.workoutEquipment.isEmpty ? nil : $0.workoutEquipment.map { $0.rawValue } },
            injuries: profile.flatMap { $0.injuriesOrLimitations.isEmpty ? nil : $0.injuriesOrLimitations },
            dietaryRestrictions: profile.flatMap { $0.dietaryRestrictions.isEmpty ? nil : $0.dietaryRestrictions }
        )
    }

    private func toExercisePayload(_ ex: WorkoutExercise) -> RicoExercisePayload {
        RicoExercisePayload(name: ex.name, sets: ex.sets, reps: ex.reps, notes: ex.notes)
    }

    // MARK: - Action Application

    private func applyActions(_ actions: [RicoAction], modelContext: ModelContext) {
        for action in actions {
            switch action {
            case .logMeal(let payload):
                let entry = MealEntry(
                    date: DateHelpers.todayString(),
                    mealType: .snack,
                    name: payload.name,
                    macros: payload.asMacros,
                    synced: false
                )
                modelContext.insert(entry)

            case .updateMacros(let payload):
                if let plan = fetchLatestPlan(modelContext: modelContext) {
                    plan.dietPlan.dailyTargets = payload.asMacros
                    plan.synced = false
                }

            case .swapExercise(let payload):
                guard let plan = fetchLatestPlan(modelContext: modelContext) else { break }
                var weeklyPlan = plan.workoutPlan.weeklyPlan
                guard let dayIdx = weeklyPlan.firstIndex(where: {
                    $0.day.lowercased() == payload.day.lowercased()
                }) else { break }

                var day = weeklyPlan[dayIdx]
                let newEx = WorkoutExercise(
                    name: payload.newExerciseName,
                    sets: payload.newSets,
                    reps: payload.newReps,
                    notes: payload.newNotes
                )
                let section = payload.section ?? "exercises"
                switch section {
                case "warmups":
                    if let idx = day.warmups?.firstIndex(where: {
                        $0.name.lowercased() == payload.oldExerciseName.lowercased()
                    }) { day.warmups?[idx] = newEx }
                case "finishers":
                    if let idx = day.finishers?.firstIndex(where: {
                        $0.name.lowercased() == payload.oldExerciseName.lowercased()
                    }) { day.finishers?[idx] = newEx }
                default:
                    if let idx = day.exercises.firstIndex(where: {
                        $0.name.lowercased() == payload.oldExerciseName.lowercased()
                    }) { day.exercises[idx] = newEx }
                }
                weeklyPlan[dayIdx] = day
                plan.workoutPlan = WorkoutPlan(
                    weeklyPlan: weeklyPlan,
                    tips: plan.workoutPlan.tips,
                    programWeek1Start: plan.workoutPlan.programWeek1Start
                )
                plan.synced = false

            case .addExercise(let payload):
                guard let plan = fetchLatestPlan(modelContext: modelContext) else { break }
                var weeklyPlan = plan.workoutPlan.weeklyPlan
                guard let dayIdx = weeklyPlan.firstIndex(where: {
                    $0.day.lowercased() == payload.day.lowercased()
                }) else { break }

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

            case .updateWorkoutDay(let payload):
                guard let plan = fetchLatestPlan(modelContext: modelContext) else { break }
                var weeklyPlan = plan.workoutPlan.weeklyPlan
                guard let dayIdx = weeklyPlan.firstIndex(where: {
                    $0.day.lowercased() == payload.day.lowercased()
                }) else { break }

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

            case .unknown(let actionType):
                print("[CoachService] Unhandled action type: \(actionType)")
            }
        }
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
