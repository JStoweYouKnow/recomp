import Foundation

public enum RecommendationSource: String, Codable, Sendable {
    case history
    case template
    case savedRecipe = "saved_recipe"
    case sponsored
}

public enum RecommendationCategory: String, Codable, Sendable {
    case meal
    case snack
}

public struct MealRecommendation: Identifiable, Sendable {
    public let id: String
    public let name: String
    public let macros: Macros
    public let source: RecommendationSource
    public let category: RecommendationCategory
    public let fitScore: Int
    public let fitReason: String
    public let mealType: MealType
    public let logCount: Int?
    public let recipeUrl: String?

    public init(
        id: String,
        name: String,
        macros: Macros,
        source: RecommendationSource,
        category: RecommendationCategory,
        fitScore: Int,
        fitReason: String,
        mealType: MealType,
        logCount: Int? = nil,
        recipeUrl: String? = nil
    ) {
        self.id = id
        self.name = name
        self.macros = macros
        self.source = source
        self.category = category
        self.fitScore = fitScore
        self.fitReason = fitReason
        self.mealType = mealType
        self.logCount = logCount
        self.recipeUrl = recipeUrl
    }
}

public struct MemoryRecommendationsResult: Sendable {
    public let meals: [MealRecommendation]
    public let snacks: [MealRecommendation]
    public let budget: Macros

    public init(meals: [MealRecommendation], snacks: [MealRecommendation], budget: Macros) {
        self.meals = meals
        self.snacks = snacks
        self.budget = budget
    }
}

/// Ranks macro-friendly meals and snacks from logged history (client-side, works offline).
public enum MemoryMealRecommender {
    private static let snackCalMax = 280
    private static let historyDays = 120

    public static func recommend(
        meals: [MealEntry],
        targets: Macros,
        consumed: Macros,
        mealLimit: Int = 6,
        snackLimit: Int = 4
    ) -> MemoryRecommendationsResult {
        let budget = consumed.remaining(from: targets)
        let clampedBudget = Macros(
            calories: max(0, budget.calories),
            protein: max(0, budget.protein),
            carbs: max(0, budget.carbs),
            fat: max(0, budget.fat)
        )

        let cutoff = Date().addingTimeInterval(-Double(historyDays) * 86400)
        var agg: [String: Agg] = [:]

        for meal in meals where meal.loggedAt >= cutoff {
            let key = normKey(meal.name)
            guard !key.isEmpty else { continue }
            if var cur = agg[key] {
                cur.count += 1
                cur.sum = cur.sum.adding(meal.macros)
                cur.typeCounts[meal.mealType, default: 0] += 1
                if meal.loggedAt > cur.lastLogged {
                    cur.lastLogged = meal.loggedAt
                    cur.displayName = meal.name.trimmingCharacters(in: .whitespaces)
                    cur.lastMealType = meal.mealType
                }
                agg[key] = cur
            } else {
                agg[key] = Agg(
                    displayName: meal.name.trimmingCharacters(in: .whitespaces),
                    count: 1,
                    sum: meal.macros,
                    lastLogged: meal.loggedAt,
                    typeCounts: [meal.mealType: 1],
                    lastMealType: meal.mealType
                )
            }
        }

        var rows: [(MealRecommendation, Double)] = []
        for (key, h) in agg where h.count >= 2 {
            let avg = Macros(
                calories: Int((Double(h.sum.calories) / Double(h.count)).rounded()),
                protein: h.sum.protein / Double(h.count),
                carbs: h.sum.carbs / Double(h.count),
                fat: h.sum.fat / Double(h.count)
            )
            let snack = isSnackLike(avg, typeCounts: h.typeCounts)
            let fit = macroFitScore(avg, remaining: clampedBudget, targets: targets)
            let score = (1 + log1p(Double(h.count))) * fit
            rows.append((
                MealRecommendation(
                    id: "history-\(key)",
                    name: h.displayName,
                    macros: avg,
                    source: .history,
                    category: snack ? .snack : .meal,
                    fitScore: Int((fit * 100).rounded()),
                    fitReason: fitReason(fit: fit, remaining: clampedBudget, macros: avg, logCount: h.count),
                    mealType: dominantMealType(h.typeCounts, fallback: h.lastMealType),
                    logCount: h.count
                ),
                score
            ))
        }

        rows.sort { $0.1 > $1.1 }

        var seen = Set<String>()
        let deduped = rows.filter { row in
            let k = normKey(row.0.name)
            guard !seen.contains(k) else { return false }
            seen.insert(k)
            return true
        }

        let mealRecs = deduped
            .filter { $0.0.category == .meal }
            .prefix(mealLimit)
            .map(\.0)

        let snackRecs = deduped
            .filter { $0.0.category == .snack || ($0.0.macros.calories > 0 && $0.0.macros.calories <= snackCalMax) }
            .prefix(snackLimit)
            .map { MealRecommendation(
                id: $0.0.id,
                name: $0.0.name,
                macros: $0.0.macros,
                source: $0.0.source,
                category: .snack,
                fitScore: $0.0.fitScore,
                fitReason: $0.0.fitReason,
                mealType: $0.0.mealType,
                logCount: $0.0.logCount
            ) }

        return MemoryRecommendationsResult(
            meals: Array(mealRecs),
            snacks: Array(snackRecs),
            budget: clampedBudget
        )
    }

    private struct Agg {
        var displayName: String
        var count: Int
        var sum: Macros
        var lastLogged: Date
        var typeCounts: [MealType: Int]
        var lastMealType: MealType
    }

    private static func normKey(_ name: String) -> String {
        name.lowercased().trimmingCharacters(in: .whitespaces)
            .components(separatedBy: .whitespaces)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private static func isSnackLike(_ macros: Macros, typeCounts: [MealType: Int]) -> Bool {
        if macros.calories > 0 && macros.calories <= snackCalMax { return true }
        let snackCount = typeCounts[.snack, default: 0]
        let mealCount = (typeCounts[.breakfast, default: 0])
            + (typeCounts[.lunch, default: 0])
            + (typeCounts[.dinner, default: 0])
        return snackCount > 0 && snackCount >= mealCount
    }

    private static func dominantMealType(_ counts: [MealType: Int], fallback: MealType) -> MealType {
        counts.max(by: { $0.value < $1.value })?.key ?? fallback
    }

    private static func macroFitScore(_ m: Macros, remaining: Macros, targets: Macros) -> Double {
        let remC = max(0, Double(remaining.calories))
        let remP = max(0, remaining.protein)
        let c = max(0, Double(m.calories))
        let p = max(0, m.protein)
        var score = 1.0

        if remC < 1 {
            score *= c <= 120 ? 1 : max(0.35, 1 - (c - 120) / 400)
        } else if c > remC {
            score *= max(0.15, 1 - (c - remC) / max(remC, 1))
        } else {
            let share = c / remC
            if remC > 200 && share < 0.12 { score *= 0.65 + 0.35 * min(1, share / 0.12) }
            else { score *= 0.88 + 0.12 * share }
        }

        if remP > 5 && targets.protein > 0 {
            let idealP = min(remP, max(12, remP * 0.55))
            let err = abs(p - idealP) / max(idealP, 8)
            score *= max(0.45, 1 - 0.45 * min(err, 1.2))
        }

        return min(1, max(0.08, score))
    }

    private static func fitReason(fit: Double, remaining: Macros, macros: Macros, logCount: Int) -> String {
        var parts: [String] = []
        if logCount >= 3 { parts.append("Logged \(logCount)×") }
        else if logCount >= 2 { parts.append("Logged before") }
        if fit >= 0.85 {
            parts.append("Fits your remaining \(remaining.calories) cal")
        } else {
            parts.append("\(macros.calories) cal · \(Int(macros.protein.rounded()))g protein")
        }
        return parts.joined(separator: " · ")
    }
}
