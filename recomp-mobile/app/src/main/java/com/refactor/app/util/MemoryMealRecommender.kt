package com.refactor.app.util

import com.refactor.app.api.dto.MealEntryDto
import com.refactor.app.api.dto.MealMacrosDto
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

enum class RecommendationSource {
    history,
    template,
    saved_recipe,
    sponsored,
}

enum class RecommendationCategory {
    meal,
    snack,
}

data class MealRecommendation(
    val id: String,
    val name: String,
    val macros: MealMacrosDto,
    val source: RecommendationSource,
    val category: RecommendationCategory,
    val fitScore: Int,
    val fitReason: String,
    val mealType: String,
    val logCount: Int? = null,
)

data class MemoryRecommendationsResult(
    val meals: List<MealRecommendation>,
    val snacks: List<MealRecommendation>,
    val budget: MealMacrosDto,
)

object MemoryMealRecommender {
    private const val SNACK_CAL_MAX = 280
    private const val HISTORY_DAYS = 120

    fun recommend(
        meals: List<MealEntryDto>,
        targets: MealMacrosDto,
        consumed: MealMacrosDto,
        mealLimit: Int = 6,
        snackLimit: Int = 4,
    ): MemoryRecommendationsResult {
        val budget = MealMacrosDto(
            calories = max(0.0, targets.calories - consumed.calories),
            protein = max(0.0, targets.protein - consumed.protein),
            carbs = max(0.0, targets.carbs - consumed.carbs),
            fat = max(0.0, targets.fat - consumed.fat),
        )

        val cutoffMs = System.currentTimeMillis() - HISTORY_DAYS * 86400000L
        val agg = linkedMapOf<String, Agg>()

        for (meal in meals) {
            val loggedMs = parseLoggedMs(meal)
            if (loggedMs < cutoffMs) continue
            val key = normKey(meal.name)
            if (key.isEmpty()) continue
            val cur = agg.getOrPut(key) {
                Agg(
                    displayName = meal.name.trim(),
                    count = 0,
                    sumCal = 0.0,
                    sumP = 0.0,
                    sumC = 0.0,
                    sumF = 0.0,
                    lastLoggedMs = loggedMs,
                    typeCounts = mutableMapOf(),
                    lastMealType = meal.mealType,
                )
            }
            cur.count += 1
            cur.sumCal += meal.macros.calories
            cur.sumP += meal.macros.protein
            cur.sumC += meal.macros.carbs
            cur.sumF += meal.macros.fat
            cur.typeCounts[meal.mealType] = (cur.typeCounts[meal.mealType] ?: 0) + 1
            if (loggedMs > cur.lastLoggedMs) {
                cur.lastLoggedMs = loggedMs
                cur.displayName = meal.name.trim()
                cur.lastMealType = meal.mealType
            }
        }

        val rows = agg
            .filter { (_, h) -> h.count >= 2 }
            .map { (key, h) ->
                val avg = MealMacrosDto(
                    calories = (h.sumCal / h.count),
                    protein = h.sumP / h.count,
                    carbs = h.sumC / h.count,
                    fat = h.sumF / h.count,
                )
                val snack = isSnackLike(avg, h.typeCounts)
                val fit = macroFitScore(avg, budget, targets)
                val score = (1 + ln(1 + h.count.toDouble())) * fit
                val rec = MealRecommendation(
                    id = "history-$key",
                    name = h.displayName,
                    macros = avg,
                    source = RecommendationSource.history,
                    category = if (snack) RecommendationCategory.snack else RecommendationCategory.meal,
                    fitScore = (fit * 100).roundToInt().coerceIn(0, 100),
                    fitReason = fitReason(fit, budget, avg, h.count),
                    mealType = dominantMealType(h.typeCounts, h.lastMealType),
                    logCount = h.count,
                )
                rec to score
            }
            .sortedByDescending { it.second }

        val seen = mutableSetOf<String>()
        val deduped = rows.filter { (rec, _) ->
            val k = normKey(rec.name)
            seen.add(k)
        }

        val mealRecs = deduped
            .filter { (rec, _) -> rec.category == RecommendationCategory.meal }
            .take(mealLimit)
            .map { it.first }

        val snackRecs = deduped
            .filter { (rec, _) ->
                rec.category == RecommendationCategory.snack ||
                    (rec.macros.calories > 0 && rec.macros.calories <= SNACK_CAL_MAX)
            }
            .take(snackLimit)
            .map { (rec, _) -> rec.copy(category = RecommendationCategory.snack) }

        return MemoryRecommendationsResult(
            meals = mealRecs,
            snacks = snackRecs,
            budget = budget,
        )
    }

    private data class Agg(
        var displayName: String,
        var count: Int,
        var sumCal: Double,
        var sumP: Double,
        var sumC: Double,
        var sumF: Double,
        var lastLoggedMs: Long,
        val typeCounts: MutableMap<String, Int>,
        var lastMealType: String,
    )

    private fun parseLoggedMs(meal: MealEntryDto): Long {
        val iso = meal.loggedAt ?: "${meal.date}T12:00:00.000Z"
        return runCatching { java.time.Instant.parse(iso).toEpochMilli() }.getOrDefault(0L)
    }

    private fun normKey(name: String): String =
        name.lowercase().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")

    private fun isSnackLike(macros: MealMacrosDto, typeCounts: Map<String, Int>): Boolean {
        if (macros.calories > 0 && macros.calories <= SNACK_CAL_MAX) return true
        val snackCount = typeCounts["snack"] ?: 0
        val mealCount = (typeCounts["breakfast"] ?: 0) +
            (typeCounts["lunch"] ?: 0) +
            (typeCounts["dinner"] ?: 0)
        return snackCount > 0 && snackCount >= mealCount
    }

    private fun dominantMealType(counts: Map<String, Int>, fallback: String): String =
        counts.maxByOrNull { it.value }?.key ?: fallback

    private fun macroFitScore(m: MealMacrosDto, remaining: MealMacrosDto, targets: MealMacrosDto): Double {
        val remC = max(0.0, remaining.calories)
        val remP = max(0.0, remaining.protein)
        val c = max(0.0, m.calories)
        val p = max(0.0, m.protein)
        var score = 1.0

        if (remC < 1) {
            score *= if (c <= 120) 1.0 else max(0.35, 1 - (c - 120) / 400)
        } else if (c > remC) {
            score *= max(0.15, 1 - (c - remC) / max(remC, 1.0))
        } else {
            val share = c / remC
            score *= if (remC > 200 && share < 0.12) 0.65 + 0.35 * min(1.0, share / 0.12)
            else 0.88 + 0.12 * share
        }

        if (remP > 5 && targets.protein > 0) {
            val idealP = min(remP, max(12.0, remP * 0.55))
            val err = kotlin.math.abs(p - idealP) / max(idealP, 8.0)
            score *= max(0.45, 1 - 0.45 * min(err, 1.2))
        }

        return min(1.0, max(0.08, score))
    }

    private fun fitReason(fit: Double, remaining: MealMacrosDto, macros: MealMacrosDto, logCount: Int): String {
        val parts = mutableListOf<String>()
        when {
            logCount >= 3 -> parts.add("Logged ${logCount}×")
            logCount >= 2 -> parts.add("Logged before")
        }
        if (fit >= 0.85) {
            parts.add("Fits your remaining ${remaining.calories.roundToInt()} cal")
        } else {
            parts.add("${macros.calories.roundToInt()} cal · ${macros.protein.roundToInt()}g protein")
        }
        return parts.joinToString(" · ")
    }
}
