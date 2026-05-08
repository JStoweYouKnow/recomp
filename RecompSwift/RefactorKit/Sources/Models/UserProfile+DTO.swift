import Foundation

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
            learnedTDEE: nil,
            measurementTargets: nil,
            currentBodyFatPercent: nil,
            currentMuscleMassLbs: nil
        )
    }
}
