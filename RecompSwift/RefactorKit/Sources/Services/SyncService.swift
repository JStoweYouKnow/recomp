import Foundation
import SwiftData

/// Background SwiftData actor that reads local models for push and upserts server
/// data on pull. Conforms to `ModelActor` so SwiftData operations are safely
/// isolated to this actor's serial executor — no main-thread required.
public actor SyncService: ModelActor {

    // MARK: - ModelActor requirements
    public let modelContainer: ModelContainer
    public let modelExecutor: any ModelExecutor

    // MARK: - Private state
    private let api: APIClient
    private var syncTask: Task<Void, Never>?
    private var isDirty = false
    private let iso8601 = ISO8601DateFormatter()

    public init(api: APIClient = .shared, modelContainer: ModelContainer) {
        self.api = api
        self.modelContainer = modelContainer
        let context = ModelContext(modelContainer)
        self.modelExecutor = DefaultSerialModelExecutor(modelContext: context)
    }

    // MARK: - Push (local → server)

    public func markDirty() {
        isDirty = true
        scheduleSync()
    }

    public func scheduleSync() {
        syncTask?.cancel()
        syncTask = Task {
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled, isDirty else { return }
            await syncNow()
        }
    }

    public func syncNow() async {
        isDirty = false
        do {
            let meals      = (try? modelContext.fetch(FetchDescriptor<MealEntry>())) ?? []
            let milestones = (try? modelContext.fetch(FetchDescriptor<Milestone>())) ?? []
            let plans      = (try? modelContext.fetch(FetchDescriptor<FitnessPlan>())) ?? []

            let mealDTOs      = meals.map { MealEntryDTO(from: $0, iso8601: iso8601) }
            let milestoneDTOs = milestones.map { MilestoneEntryDTO(from: $0, iso8601: iso8601) }
            let planDTO       = plans.first.map { FitnessPlanDTO(from: $0, iso8601: iso8601) }

            let payload = SyncPayload(
                profile: nil,
                meals: mealDTOs.isEmpty ? nil : mealDTOs,
                plan: planDTO,
                milestones: milestoneDTOs.isEmpty ? nil : milestoneDTOs
            )
            try await api.requestVoid(MiscAPI.dataSync(payload: payload))
        } catch {
            isDirty = true
        }
    }

    // MARK: - Pull (server → local)

    /// Fetches the full snapshot from the server and upserts it into the local store.
    public func fetchAndApply() async throws {
        let data = try await api.requestRaw(MiscAPI.dataFetch)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let response = try decoder.decode(SyncResponseDTO.self, from: data)

        if let dto = response.profile { upsertProfile(dto) }
        if let dto = response.plan    { upsertPlan(dto) }

        // Full replace so deletes and web-only edits converge (insert-only left orphans forever).
        if let mealDTOs = response.meals {
            for m in (try? modelContext.fetch(FetchDescriptor<MealEntry>())) ?? [] {
                modelContext.delete(m)
            }
            for dto in mealDTOs {
                if let meal = MealEntry(dto: dto, iso8601: iso8601) {
                    modelContext.insert(meal)
                }
            }
        }

        if let milestoneDTOs = response.milestones {
            for x in (try? modelContext.fetch(FetchDescriptor<Milestone>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in milestoneDTOs {
                if let milestone = Milestone(dto: dto, iso8601: iso8601) {
                    modelContext.insert(milestone)
                }
            }
        }

        try modelContext.save()
    }

    // MARK: - Upsert helpers

    private func upsertProfile(_ dto: UserProfileDTO) {
        let id = dto.id
        var descriptor = FetchDescriptor<UserProfile>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1

        if let existing = (try? modelContext.fetch(descriptor))?.first {
            existing.name               = dto.name
            existing.email              = dto.email
            existing.avatarDataUrl      = dto.avatarDataUrl
            existing.age                = dto.age
            existing.weight             = dto.weight
            existing.height             = dto.height
            existing.gender             = Gender(rawValue: dto.gender) ?? existing.gender
            existing.fitnessLevel       = FitnessLevel(rawValue: dto.fitnessLevel) ?? existing.fitnessLevel
            existing.goal               = FitnessGoal(rawValue: dto.goal) ?? existing.goal
            existing.dietaryRestrictions    = dto.dietaryRestrictions ?? existing.dietaryRestrictions
            existing.injuriesOrLimitations  = dto.injuriesOrLimitations ?? existing.injuriesOrLimitations
            existing.dailyActivityLevel = ActivityLevel(rawValue: dto.dailyActivityLevel ?? "") ?? existing.dailyActivityLevel
            existing.unitSystem         = MeasurementSystem(rawValue: dto.unitSystem ?? "") ?? existing.unitSystem
            existing.workoutLocation    = dto.workoutLocation.flatMap { WorkoutLocation(rawValue: $0) }
            existing.workoutEquipment   = (dto.workoutEquipment ?? []).compactMap { WorkoutEquipment(rawValue: $0) }
            existing.workoutDaysPerWeek = dto.workoutDaysPerWeek ?? existing.workoutDaysPerWeek
            existing.workoutTimeframe   = dto.workoutTimeframe.flatMap { WorkoutTimeframe(rawValue: $0) }
            existing.lastSyncedAt       = .now
        } else {
            modelContext.insert(UserProfile(
                id:                     dto.id,
                name:                   dto.name,
                email:                  dto.email,
                avatarDataUrl:          dto.avatarDataUrl,
                age:                    dto.age,
                weight:                 dto.weight,
                height:                 dto.height,
                gender:                 Gender(rawValue: dto.gender) ?? .other,
                fitnessLevel:           FitnessLevel(rawValue: dto.fitnessLevel) ?? .beginner,
                goal:                   FitnessGoal(rawValue: dto.goal) ?? .maintain,
                dietaryRestrictions:    dto.dietaryRestrictions ?? [],
                injuriesOrLimitations:  dto.injuriesOrLimitations ?? [],
                dailyActivityLevel:     ActivityLevel(rawValue: dto.dailyActivityLevel ?? "moderate") ?? .moderate,
                unitSystem:             MeasurementSystem(rawValue: dto.unitSystem ?? "us") ?? .us,
                workoutLocation:        dto.workoutLocation.flatMap { WorkoutLocation(rawValue: $0) },
                workoutEquipment:       (dto.workoutEquipment ?? []).compactMap { WorkoutEquipment(rawValue: $0) },
                workoutDaysPerWeek:     dto.workoutDaysPerWeek ?? 4,
                workoutTimeframe:       dto.workoutTimeframe.flatMap { WorkoutTimeframe(rawValue: $0) },
                lastSyncedAt:           .now
            ))
        }
    }

    private func upsertPlan(_ dto: FitnessPlanDTO) {
        let id = dto.id
        var descriptor = FetchDescriptor<FitnessPlan>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1

        let createdAt = iso8601.date(from: dto.createdAt) ?? .now
        let dietPlan = DietPlan(
            dailyTargets: dto.dietPlan.dailyTargets,
            weeklyPlan:   dto.dietPlan.weeklyPlan,
            tips:         dto.dietPlan.tips
        )
        let workoutPlan = WorkoutPlan(
            weeklyPlan: dto.workoutPlan.weeklyPlan,
            tips:       dto.workoutPlan.tips
        )

        if let existing = (try? modelContext.fetch(descriptor))?.first {
            existing.createdAt   = createdAt
            existing.dietPlan    = dietPlan
            existing.workoutPlan = workoutPlan
            existing.reasoning   = dto.reasoning
            existing.synced      = true
        } else {
            modelContext.insert(FitnessPlan(
                id:          dto.id,
                userId:      dto.userId,
                createdAt:   createdAt,
                dietPlan:    dietPlan,
                workoutPlan: workoutPlan,
                reasoning:   dto.reasoning,
                synced:      true
            ))
        }
    }
}

// MARK: - DTO ↔ Model mapping

extension MealEntryDTO {
    init(from entry: MealEntry, iso8601: ISO8601DateFormatter) {
        self.init(
            id:        entry.id,
            date:      entry.date,
            mealType:  entry.mealType.rawValue,
            name:      entry.name,
            macros:    entry.macros,
            notes:     entry.notes,
            imageUrl:  entry.imageUrl,
            loggedAt:  iso8601.string(from: entry.loggedAt)
        )
    }
}

extension MilestoneEntryDTO {
    init(from milestone: Milestone, iso8601: ISO8601DateFormatter) {
        self.init(
            id:       milestone.id,
            earnedAt: iso8601.string(from: milestone.earnedAt),
            progress: milestone.progress
        )
    }
}

extension MealEntry {
    convenience init?(dto: MealEntryDTO, iso8601: ISO8601DateFormatter) {
        guard let mealType = MealType(rawValue: dto.mealType) else { return nil }
        let loggedAt = dto.loggedAt.flatMap { iso8601.date(from: $0) } ?? .now
        self.init(
            id:       dto.id,
            date:     dto.date,
            mealType: mealType,
            name:     dto.name,
            macros:   dto.macros,
            notes:    dto.notes,
            imageUrl: dto.imageUrl,
            loggedAt: loggedAt,
            synced:   true
        )
    }
}

extension Milestone {
    convenience init?(dto: MilestoneEntryDTO, iso8601: ISO8601DateFormatter) {
        guard let type = MilestoneType(rawValue: dto.id) else { return nil }
        let earnedAt = iso8601.date(from: dto.earnedAt) ?? .now
        self.init(milestoneType: type, earnedAt: earnedAt, progress: dto.progress)
    }
}

extension FitnessPlanDTO {
    init(from plan: FitnessPlan, iso8601: ISO8601DateFormatter) {
        self.init(
            id:        plan.id,
            userId:    plan.userId,
            createdAt: iso8601.string(from: plan.createdAt),
            dietPlan: PlanDietPlanDTO(
                dailyTargets: plan.dietPlan.dailyTargets,
                weeklyPlan:   plan.dietPlan.weeklyPlan,
                tips:         plan.dietPlan.tips
            ),
            workoutPlan: PlanWorkoutPlanDTO(
                weeklyPlan: plan.workoutPlan.weeklyPlan,
                tips:       plan.workoutPlan.tips
            ),
            reasoning: plan.reasoning
        )
    }
}
