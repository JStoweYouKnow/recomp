package com.refactor.app.api

/**
 * Converts between the user's chosen entry unit and the pounds every set log,
 * progression calculation, and personal record is stored in.
 *
 * Storage stays in pounds unconditionally — [Progression], `PersonalRecordStore`, and the
 * server all assume it. Only what the user types and reads is converted, so a metric
 * lifter's numbers stay comparable with their own history and with the web app.
 *
 * Mirrors iOS `MassUnit`.
 */
enum class MassUnit(val label: String) {
    POUNDS("lbs"),
    KILOGRAMS("kg");

    /** Convert a value the user typed into stored pounds. */
    fun toPounds(value: Double): Double = when (this) {
        POUNDS -> value
        KILOGRAMS -> value / LBS_TO_KG
    }

    /** Convert stored pounds into the unit the user reads. */
    fun fromPounds(pounds: Double): Double = when (this) {
        POUNDS -> pounds
        KILOGRAMS -> pounds * LBS_TO_KG
    }

    /** Display string with at most one decimal place, trimming a trailing `.0`. */
    fun display(pounds: Double): String = trimmed(fromPounds(pounds))

    companion object {
        const val LBS_TO_KG = 0.45359237

        /** `unitSystem` is the profile's raw string ("us" | "metric"). */
        fun forSystem(unitSystem: String?): MassUnit =
            if (unitSystem == "metric") KILOGRAMS else POUNDS

        fun trimmed(value: Double): String {
            val rounded = Math.round(value * 10.0) / 10.0
            return if (rounded % 1.0 == 0.0) rounded.toInt().toString()
            else String.format("%.1f", rounded)
        }
    }
}
