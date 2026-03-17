import Foundation

enum MacroCalculator {
    static func bmr(weight: Double, height: Double, age: Int, gender: Gender) -> Double {
        switch gender {
        case .male:
            return 10 * weight + 6.25 * height - 5 * Double(age) + 5
        case .female:
            return 10 * weight + 6.25 * height - 5 * Double(age) - 161
        case .other:
            return 10 * weight + 6.25 * height - 5 * Double(age) - 78
        }
    }

    static func tdee(bmr: Double, activityLevel: ActivityLevel) -> Double {
        bmr * activityLevel.multiplier
    }

    static func targetCalories(tdee: Double, goal: FitnessGoal) -> Int {
        switch goal {
        case .loseWeight: return Int(tdee * 0.80)
        case .maintain: return Int(tdee)
        case .buildMuscle: return Int(tdee * 1.10)
        case .improveEndurance: return Int(tdee * 1.05)
        }
    }

    static func defaultMacros(calories: Int, goal: FitnessGoal, weightKg: Double) -> Macros {
        let protein: Double
        let fatPercent: Double

        switch goal {
        case .loseWeight:
            protein = weightKg * 2.2
            fatPercent = 0.25
        case .buildMuscle:
            protein = weightKg * 2.4
            fatPercent = 0.25
        case .maintain, .improveEndurance:
            protein = weightKg * 2.0
            fatPercent = 0.30
        }

        let proteinCals = protein * 4
        let fatCals = Double(calories) * fatPercent
        let fat = fatCals / 9
        let carbCals = Double(calories) - proteinCals - fatCals
        let carbs = max(carbCals / 4, 0)

        return Macros(
            calories: calories,
            protein: round(protein),
            carbs: round(carbs),
            fat: round(fat)
        )
    }

    static func xpLevel(for xp: Int) -> Int {
        let thresholds = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500]
        for (level, threshold) in thresholds.enumerated().reversed() {
            if xp >= threshold { return level }
        }
        return 0
    }

    static func xpToNextLevel(currentXP: Int) -> (current: Int, needed: Int) {
        let thresholds = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500]
        let level = xpLevel(for: currentXP)
        let currentThreshold = thresholds[min(level, thresholds.count - 1)]
        let nextThreshold = level + 1 < thresholds.count ? thresholds[level + 1] : thresholds.last! + 1000
        return (currentXP - currentThreshold, nextThreshold - currentThreshold)
    }
}

extension ActivityLevel {
    var multiplier: Double {
        switch self {
        case .sedentary: return 1.2
        case .light: return 1.375
        case .moderate: return 1.55
        case .active: return 1.725
        case .veryActive: return 1.9
        }
    }
}
