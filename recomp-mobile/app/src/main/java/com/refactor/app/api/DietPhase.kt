package com.refactor.app.api

import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Diet phase state machine.
 *
 * The app already estimates TDEE well (`/api/metabolic/update` regresses weight trend against
 * intake). Nothing consumed it. This closes that loop: it reads the trend, judges whether the
 * rate of change is actually productive, and moves the lifter between phases — cut,
 * maintenance, diet break, lean bulk — instead of letting them sit in a permanent deficit
 * until adherence collapses.
 *
 * The core judgement is rate, not direction. Losing 3 lb a week is not "working better" than
 * losing 1; it is losing lean mass and borrowing against the next twelve weeks.
 *
 * Mirrors web `src/lib/diet-phase.ts` and iOS `DietPhase.swift`.
 */
object DietPhase {

    // ── Tunables ────────────────────────────────────────

    /** Smoothing factor for the exponentially weighted trend weight (~10-day half life). */
    private const val TREND_ALPHA = 0.1
    /** Minimum weigh-ins before a trend is trustworthy. */
    private const val MIN_WEIGH_INS = 4

    /** Productive weekly loss, as a fraction of body weight. */
    private const val LOSS_TARGET_MIN = 0.005
    private const val LOSS_TARGET_MAX = 0.01
    /** Past this, lean mass is going with the fat. */
    private const val LOSS_AGGRESSIVE = 0.015

    /** Productive weekly gain on a lean bulk, as a fraction of body weight. */
    private const val GAIN_TARGET_MIN = 0.0025
    private const val GAIN_TARGET_MAX = 0.005

    /** Consecutive weeks in a deficit before a diet break is due. */
    private const val DIET_BREAK_AFTER_WEEKS = 12
    /** A stall this long in an active phase means the plan needs changing. */
    private const val STALL_WEEKS = 3

    /** kcal per pound of body mass. */
    private const val KCAL_PER_LB = 3500.0

    // ── Types ───────────────────────────────────────────

    enum class Name(val label: String) {
        CUT("Cut"),
        MAINTENANCE("Maintenance"),
        DIET_BREAK("Diet break"),
        LEAN_BULK("Lean bulk"),
        RECOMP("Recomp"),
    }

    enum class RateVerdict { TOO_FAST, ON_TRACK, TOO_SLOW, STALLED, WRONG_DIRECTION }

    data class WeighIn(
        val date: String,
        val weightLbs: Double?,
        val bodyFatPercent: Double? = null,
    )

    data class Trend(
        /** Exponentially weighted trend weight in lbs — the number to coach off. */
        val trendWeightLbs: Double,
        val latestWeightLbs: Double,
        /** Weekly change in lbs (negative = losing). */
        val weeklyChangeLbs: Double,
        /** Weekly change as a fraction of body weight. */
        val weeklyChangePct: Double,
        val weighInCount: Int,
        val spanDays: Int,
        /** False when there is not enough data to judge anything. */
        val reliable: Boolean,
    )

    data class LeanMassSignal(
        val leanChangeLbs: Double,
        val leanShareOfLoss: Double,
        val losingLeanMass: Boolean,
    )

    data class Assessment(
        val phase: Name,
        val rateVerdict: RateVerdict,
        val trend: Trend,
        val leanMass: LeanMassSignal?,
        /** Suggested daily calorie change from current intake. 0 when nothing should move. */
        val calorieAdjustment: Int,
        val weeksInPhase: Int,
        val dietBreakDue: Boolean,
        val headline: String,
        val details: List<String>,
        val suggestedPhase: Name?,
    )

    // ── Trend weight ────────────────────────────────────

    private fun dayNumber(date: String): Double? = try {
        LocalDate.parse(date).toEpochDay().toDouble()
    } catch (_: DateTimeParseException) {
        null
    }

    /**
     * Exponentially weighted trend weight and its weekly rate of change.
     *
     * Daily scale weight swings several pounds on water and glycogen alone. Coaching off the
     * last weigh-in produces whiplash; coaching off the trend produces decisions.
     */
    fun computeTrend(weighIns: List<WeighIn>): Trend {
        val points = weighIns
            .mapNotNull { w -> w.weightLbs?.takeIf { it > 0 }?.let { w.date to it } }
            .sortedBy { it.first }

        if (points.isEmpty()) {
            return Trend(0.0, 0.0, 0.0, 0.0, 0, 0, false)
        }

        // EWMA gives the displayed trend weight — smooth, and what the user reads off the scale.
        var trend = points.first().second
        for (point in points.drop(1)) {
            trend = TREND_ALPHA * point.second + (1 - TREND_ALPHA) * trend
        }

        val day0 = dayNumber(points.first().first)
        val dayN = dayNumber(points.last().first)
        if (day0 == null || dayN == null) {
            return Trend(
                Math.round(trend * 10) / 10.0, points.last().second, 0.0, 0.0,
                points.size, 0, false,
            )
        }
        val spanDays = max(0, (dayN - day0).roundToInt())

        /*
         * Rate comes from least-squares regression on the raw weigh-ins, not from the EWMA.
         * An EWMA lags a trending series, so measuring endpoint-to-endpoint across it would
         * systematically understate how fast weight is actually moving — which would have the
         * engine calling an aggressive 2%/week cut "on track". Regression is unbiased.
         */
        var weeklyChangeLbs = 0.0
        if (spanDays >= 7 && points.size >= 2) {
            val xs = points.mapNotNull { dayNumber(it.first)?.minus(day0) }
            val ys = points.map { it.second }
            if (xs.size == ys.size && xs.size >= 2) {
                val n = xs.size.toDouble()
                val meanX = xs.sum() / n
                val meanY = ys.sum() / n
                var ssXY = 0.0
                var ssXX = 0.0
                for (i in xs.indices) {
                    ssXY += (xs[i] - meanX) * (ys[i] - meanY)
                    ssXX += (xs[i] - meanX) * (xs[i] - meanX)
                }
                weeklyChangeLbs = if (ssXX == 0.0) 0.0 else (ssXY / ssXX) * 7
            }
        }

        val weeklyChangePct = if (trend > 0) weeklyChangeLbs / trend else 0.0

        return Trend(
            trendWeightLbs = Math.round(trend * 10) / 10.0,
            latestWeightLbs = points.last().second,
            weeklyChangeLbs = Math.round(weeklyChangeLbs * 100) / 100.0,
            weeklyChangePct = Math.round(weeklyChangePct * 10000) / 10000.0,
            weighInCount = points.size,
            spanDays = spanDays,
            reliable = points.size >= MIN_WEIGH_INS && spanDays >= 10,
        )
    }

    /**
     * Whether weight lost is coming from fat or from muscle.
     *
     * A cut that strips lean mass is not a successful cut — it is the reason people end a diet
     * smaller, weaker, and with a lower TDEE than they started.
     */
    fun computeLeanMassSignal(weighIns: List<WeighIn>): LeanMassSignal? {
        val points = weighIns
            .mapNotNull { w ->
                val weight = w.weightLbs?.takeIf { it > 0 } ?: return@mapNotNull null
                val bf = w.bodyFatPercent?.takeIf { it > 0 } ?: return@mapNotNull null
                Triple(w.date, weight, bf)
            }
            .sortedBy { it.first }

        if (points.size < 2) return null

        val first = points.first()
        val last = points.last()
        val leanFirst = first.second * (1 - first.third / 100)
        val leanLast = last.second * (1 - last.third / 100)
        val leanChangeLbs = Math.round((leanLast - leanFirst) * 100) / 100.0
        val totalChange = last.second - first.second

        // Only meaningful while losing; a gain phase is judged on other terms.
        val leanShareOfLoss = if (totalChange < 0) {
            Math.round((abs(leanChangeLbs) / abs(totalChange)) * 100) / 100.0
        } else 0.0

        return LeanMassSignal(
            leanChangeLbs = leanChangeLbs,
            leanShareOfLoss = leanShareOfLoss,
            // More than a quarter of loss coming from lean tissue is the warning line.
            losingLeanMass = totalChange < 0 && leanChangeLbs < 0 && leanShareOfLoss > 0.25,
        )
    }

    // ── Rate judgement ──────────────────────────────────

    private fun verdictForCut(pct: Double): RateVerdict {
        val loss = -pct
        return when {
            loss >= LOSS_AGGRESSIVE -> RateVerdict.TOO_FAST
            loss >= LOSS_TARGET_MIN -> RateVerdict.ON_TRACK
            loss > 0 -> RateVerdict.TOO_SLOW
            pct == 0.0 -> RateVerdict.STALLED
            else -> RateVerdict.WRONG_DIRECTION
        }
    }

    private fun verdictForBulk(pct: Double): RateVerdict = when {
        pct > GAIN_TARGET_MAX -> RateVerdict.TOO_FAST
        pct >= GAIN_TARGET_MIN -> RateVerdict.ON_TRACK
        pct > 0 -> RateVerdict.TOO_SLOW
        pct == 0.0 -> RateVerdict.STALLED
        else -> RateVerdict.WRONG_DIRECTION
    }

    /** Maintenance wants the trend flat; drift in either direction is the signal. */
    private fun verdictForFlat(pct: Double): RateVerdict = when {
        abs(pct) <= 0.0025 -> RateVerdict.ON_TRACK
        pct > 0 -> RateVerdict.TOO_FAST
        else -> RateVerdict.WRONG_DIRECTION
    }

    fun phaseForGoal(goal: String): Name = when (goal) {
        "lose_weight" -> Name.CUT
        "build_muscle" -> Name.LEAN_BULK
        else -> Name.MAINTENANCE
    }

    // ── Assessment ──────────────────────────────────────

    /**
     * Read the trend and decide what should change.
     *
     * Deliberately conservative: with thin data it says so and adjusts nothing, because a
     * calorie change made on noise costs more trust than a week of waiting.
     */
    fun assess(
        goal: String,
        weighIns: List<WeighIn>,
        currentCalories: Int,
        estimatedTDEE: Int? = null,
        tdeeConfidence: Int? = null,
        weeksInDeficit: Int? = null,
    ): Assessment {
        val trend = computeTrend(weighIns)
        val leanMass = computeLeanMassSignal(weighIns)
        val phase = phaseForGoal(goal)
        val weeksInPhase = trend.spanDays / 7
        val deficitWeeks = weeksInDeficit ?: if (phase == Name.CUT) weeksInPhase else 0
        val dietBreakDue = phase == Name.CUT && deficitWeeks >= DIET_BREAK_AFTER_WEEKS

        if (!trend.reliable) {
            return Assessment(
                phase = phase,
                rateVerdict = RateVerdict.STALLED,
                trend = trend,
                leanMass = leanMass,
                calorieAdjustment = 0,
                weeksInPhase = weeksInPhase,
                dietBreakDue = false,
                headline = "Not enough weigh-ins yet to judge your rate.",
                details = listOf("Log at least $MIN_WEIGH_INS weigh-ins across 10+ days and this turns into real guidance."),
                suggestedPhase = null,
            )
        }

        val pct = trend.weeklyChangePct
        val rateVerdict = when (phase) {
            Name.CUT -> verdictForCut(pct)
            Name.LEAN_BULK -> verdictForBulk(pct)
            else -> verdictForFlat(pct)
        }

        val details = mutableListOf<String>()
        var calorieAdjustment = 0
        var headline: String
        var suggestedPhase: Name? = null

        val weeklyAbs = abs(trend.weeklyChangeLbs)
        val weeklyStr = String.format("%.1f", weeklyAbs)
        val pctLabel = String.format("%.2f%%", abs(pct) * 100)

        if (dietBreakDue) {
            suggestedPhase = Name.DIET_BREAK
            calorieAdjustment = max(0, (estimatedTDEE ?: currentCalories) - currentCalories)
            headline = "$deficitWeeks weeks in a deficit — time for a diet break."
            details.add("Eat at maintenance for 1–2 weeks. This restores hormones and adherence, and makes the next block of fat loss work.")
            if (calorieAdjustment > 0) {
                details.add("That means about +$calorieAdjustment kcal/day back to maintenance.")
            }
        } else if (phase == Name.CUT) {
            when (rateVerdict) {
                RateVerdict.TOO_FAST -> {
                    calorieAdjustment = (((weeklyAbs - trend.trendWeightLbs * LOSS_TARGET_MAX) * KCAL_PER_LB) / 7).roundToInt()
                    headline = "Losing $weeklyStr lb/week ($pctLabel) — faster than is productive."
                    details.add("Above ~1% of body weight per week, a growing share of the loss is muscle.")
                    details.add("Add about $calorieAdjustment kcal/day to bring this into the productive range.")
                }
                RateVerdict.ON_TRACK -> {
                    headline = "Losing $weeklyStr lb/week ($pctLabel) — right in the productive range."
                    details.add("Hold everything. This is the rate that keeps muscle while fat comes off.")
                }
                RateVerdict.TOO_SLOW -> {
                    calorieAdjustment = -((((trend.trendWeightLbs * LOSS_TARGET_MIN - weeklyAbs) * KCAL_PER_LB) / 7).roundToInt())
                    headline = "Losing $weeklyStr lb/week — slower than target."
                    details.add("Trim about ${abs(calorieAdjustment)} kcal/day, or add steps before cutting food.")
                }
                RateVerdict.STALLED, RateVerdict.WRONG_DIRECTION -> {
                    calorieAdjustment = -200
                    headline = if (rateVerdict == RateVerdict.STALLED) {
                        "Weight trend is flat — the deficit has closed."
                    } else {
                        "Trend is up $weeklyStr lb/week while cutting."
                    }
                    details.add("Either intake has drifted up or your TDEE has adapted. Tighten logging for a week before cutting further.")
                    if (weeksInPhase >= STALL_WEEKS) {
                        details.add("It has been $weeksInPhase weeks — worth a diet break before pushing harder.")
                        suggestedPhase = Name.DIET_BREAK
                    }
                }
            }
        } else if (phase == Name.LEAN_BULK) {
            when (rateVerdict) {
                RateVerdict.TOO_FAST -> {
                    calorieAdjustment = -((((trend.weeklyChangeLbs - trend.trendWeightLbs * GAIN_TARGET_MAX) * KCAL_PER_LB) / 7).roundToInt())
                    headline = "Gaining $weeklyStr lb/week ($pctLabel) — faster than you can build."
                    details.add("Past ~0.5% per week the surplus mostly becomes fat. Pull back to keep the bulk lean.")
                }
                RateVerdict.ON_TRACK -> {
                    headline = "Gaining $weeklyStr lb/week — a lean-bulk pace."
                    details.add("Hold here and keep the progressive overload coming.")
                }
                RateVerdict.TOO_SLOW, RateVerdict.STALLED -> {
                    calorieAdjustment = 200
                    headline = if (rateVerdict == RateVerdict.STALLED) {
                        "Weight trend is flat — you are eating at maintenance, not a surplus."
                    } else {
                        "Gaining $weeklyStr lb/week — under the target pace."
                    }
                    details.add("Add about 200 kcal/day and re-check in two weeks.")
                }
                RateVerdict.WRONG_DIRECTION -> {
                    calorieAdjustment = 300
                    headline = "Losing $weeklyStr lb/week while trying to build."
                    details.add("You are in a deficit. Add roughly 300 kcal/day.")
                }
            }
        } else {
            when (rateVerdict) {
                RateVerdict.ON_TRACK -> {
                    headline = "Weight is holding steady — maintenance is working."
                    details.add("With training progressing, this is where a recomp happens.")
                }
                RateVerdict.TOO_FAST -> {
                    calorieAdjustment = -150
                    headline = "Trending up $weeklyStr lb/week during maintenance."
                    details.add("Trim about 150 kcal/day to flatten it out.")
                }
                else -> {
                    calorieAdjustment = 150
                    headline = "Trending down $weeklyStr lb/week during maintenance."
                    details.add("Add about 150 kcal/day to hold your weight.")
                }
            }
        }

        // Lean-mass loss overrides an otherwise acceptable rate.
        if (leanMass != null && leanMass.losingLeanMass && phase == Name.CUT) {
            val share = (leanMass.leanShareOfLoss * 100).roundToInt()
            details.add(0, "$share% of what you have lost is lean mass. Slow the deficit and keep protein and hard sets high.")
            if (calorieAdjustment <= 0) {
                calorieAdjustment = ((trend.trendWeightLbs * LOSS_TARGET_MIN * KCAL_PER_LB) / 7 / 2).roundToInt()
            }
        }

        // A drifting TDEE estimate is worth surfacing once it is trustworthy.
        if (estimatedTDEE != null && (tdeeConfidence ?: 0) >= 50 && abs(estimatedTDEE - currentCalories) >= 200) {
            details.add("Your measured TDEE is about $estimatedTDEE kcal against a $currentCalories kcal target.")
        }

        return Assessment(
            phase = phase,
            rateVerdict = rateVerdict,
            trend = trend,
            leanMass = leanMass,
            calorieAdjustment = calorieAdjustment,
            weeksInPhase = weeksInPhase,
            dietBreakDue = dietBreakDue,
            headline = headline,
            details = details,
            suggestedPhase = suggestedPhase,
        )
    }
}
