import Foundation
import SwiftData

extension UserProfile {
    public func toDTO(createdAtISO: String? = nil) -> UserProfileDTO {
        let iso = ISO8601DateFormatter()
        return UserProfileDTO(
            id: id,
            name: name,
            email: email,
            avatarDataUrl: avatarDataUrl,
            age: age,
            weight: weight,
            height: height,
            gender: gender.rawValue,
            fitnessLevel: fitnessLevel.rawValue,
            goal: goal.rawValue,
            dietaryRestrictions: dietaryRestrictions,
            injuriesOrLimitations: injuriesOrLimitations,
            dailyActivityLevel: dailyActivityLevel.rawValue,
            unitSystem: unitSystem.rawValue,
            workoutLocation: workoutLocation?.rawValue,
            workoutEquipment: workoutEquipment.map(\.rawValue),
            workoutDaysPerWeek: workoutDaysPerWeek,
            workoutTimeframe: workoutTimeframe?.rawValue,
            createdAt: createdAtISO ?? iso.string(from: createdAt),
            proAccess: proAccess,
            learnedTDEE: nil,
            measurementTargets: nil,
            currentBodyFatPercent: nil,
            currentMuscleMassLbs: nil
        )
    }

    /// Mutates this profile in place from a server DTO. Unknown enum values and
    /// missing optionals preserve the current value instead of resetting it.
    public func apply(_ dto: UserProfileDTO) {
        name = dto.name
        email = dto.email
        avatarDataUrl = dto.avatarDataUrl
        age = dto.age
        weight = dto.weight
        height = dto.height
        gender = Gender(rawValue: dto.gender) ?? gender
        fitnessLevel = FitnessLevel(rawValue: dto.fitnessLevel) ?? fitnessLevel
        goal = FitnessGoal(rawValue: dto.goal) ?? goal
        dietaryRestrictions = dto.dietaryRestrictions ?? dietaryRestrictions
        injuriesOrLimitations = dto.injuriesOrLimitations ?? injuriesOrLimitations
        dailyActivityLevel = ActivityLevel(rawValue: dto.dailyActivityLevel ?? "") ?? dailyActivityLevel
        unitSystem = MeasurementSystem(rawValue: dto.unitSystem ?? "") ?? unitSystem
        workoutLocation = dto.workoutLocation.flatMap { WorkoutLocation(rawValue: $0) }
        workoutEquipment = (dto.workoutEquipment ?? []).compactMap { WorkoutEquipment(rawValue: $0) }
        workoutDaysPerWeek = dto.workoutDaysPerWeek ?? workoutDaysPerWeek
        workoutTimeframe = dto.workoutTimeframe.flatMap { WorkoutTimeframe(rawValue: $0) }
        if let pro = dto.proAccess { proAccess = pro }
    }

    /// Single source of truth for applying a server profile DTO into SwiftData.
    /// Reused by `AuthService` (login/session) and `SyncService` (pull) so the two
    /// paths never diverge. Returns the persisted instance (existing or inserted).
    @discardableResult
    public static func upsert(from dto: UserProfileDTO, in context: ModelContext) -> UserProfile {
        let id = dto.id
        var descriptor = FetchDescriptor<UserProfile>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1

        if let existing = (try? context.fetch(descriptor))?.first {
            existing.apply(dto)
            existing.lastSyncedAt = .now
            return existing
        }

        let created = UserProfile(
            id: dto.id,
            name: dto.name,
            email: dto.email,
            avatarDataUrl: dto.avatarDataUrl,
            age: dto.age,
            weight: dto.weight,
            height: dto.height,
            gender: Gender(rawValue: dto.gender) ?? .other,
            fitnessLevel: FitnessLevel(rawValue: dto.fitnessLevel) ?? .beginner,
            goal: FitnessGoal(rawValue: dto.goal) ?? .maintain,
            dietaryRestrictions: dto.dietaryRestrictions ?? [],
            injuriesOrLimitations: dto.injuriesOrLimitations ?? [],
            dailyActivityLevel: ActivityLevel(rawValue: dto.dailyActivityLevel ?? "moderate") ?? .moderate,
            unitSystem: MeasurementSystem(rawValue: dto.unitSystem ?? "us") ?? .us,
            workoutLocation: dto.workoutLocation.flatMap { WorkoutLocation(rawValue: $0) },
            workoutEquipment: (dto.workoutEquipment ?? []).compactMap { WorkoutEquipment(rawValue: $0) },
            workoutDaysPerWeek: dto.workoutDaysPerWeek ?? 4,
            workoutTimeframe: dto.workoutTimeframe.flatMap { WorkoutTimeframe(rawValue: $0) },
            lastSyncedAt: .now,
            proAccess: dto.proAccess ?? false
        )
        context.insert(created)
        return created
    }
}
