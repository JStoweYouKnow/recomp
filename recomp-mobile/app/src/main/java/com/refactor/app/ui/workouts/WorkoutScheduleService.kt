package com.refactor.app.ui.workouts

import com.refactor.app.api.dto.FitnessPlanDto
import com.refactor.app.api.dto.MissedSessionDto
import com.refactor.app.api.dto.WorkoutDayDto
import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.api.dto.WorkoutPlanSectionDto
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

typealias WorkoutProgressMap = Map<String, String>

enum class ScheduleAction(val wire: String) {
    stay_on_week("stay_on_week"),
    skip_week("skip_week"),
    catch_up("catch_up"),
    repeat_week("repeat_week"),
}

object WorkoutScheduleService {
    private val isoDate = DateTimeFormatter.ISO_LOCAL_DATE

    fun today(): String = LocalDate.now().format(isoDate)

    private fun parse(date: String): LocalDate = LocalDate.parse(date, isoDate)

    fun mondayWeekStart(date: String): String {
        val d = parse(date)
        val dow = d.dayOfWeek.value
        val daysFromMonday = if (dow == 7) 6 else dow - 1
        return d.minusDays(daysFromMonday.toLong()).format(isoDate)
    }

    fun mondayWeeksElapsed(anchorMonday: String, otherMonday: String): Int {
        val days = ChronoUnit.DAYS.between(parse(anchorMonday), parse(otherMonday))
        return (days / 7).toInt()
    }

    fun offsetDate(date: String, deltaDays: Int): String =
        parse(date).plusDays(deltaDays.toLong()).format(isoDate)

    fun detectMissedSessions(
        plan: FitnessPlanDto,
        progress: WorkoutProgressMap,
        today: String = today(),
        lookbackDays: Int = 14,
    ): List<MissedSessionDto> {
        val wp = plan.workoutPlan?.weeklyPlan.orEmpty()
        val known = plan.workoutPlan?.missedSessions.orEmpty().map { it.id }.toSet()
        val found = mutableListOf<MissedSessionDto>()
        for (i in 1..lookbackDays) {
            val dateStr = offsetDate(today, -i)
            val planIndex = WorkoutProgramSchedule.planIndexForDate(plan, parse(dateStr)) ?: continue
            val id = sessionId(planIndex, dateStr)
            if (known.contains(id)) continue
            val alreadyTracked = plan.workoutPlan?.missedSessions.orEmpty().any {
                it.planIndex == planIndex && it.scheduledDate == dateStr && it.status != "missed"
            }
            if (alreadyTracked) continue
            if (isWorkoutSessionCompleteInternal(plan, planIndex, dateStr, progress)) continue
            val day = wp[planIndex]
            found += MissedSessionDto(
                id = id,
                planIndex = planIndex,
                scheduledDate = dateStr,
                status = "missed",
                dayLabel = day.day,
                focus = day.focus,
            )
        }
        return found
    }

    fun getCatchUpQueue(plan: FitnessPlanDto): List<MissedSessionDto> =
        plan.workoutPlan?.missedSessions.orEmpty()
            .filter { it.status == "missed" || (it.status == "rescheduled" && it.rescheduledTo != null) }
            .sortedBy { it.scheduledDate }

    fun countRecentMissed(
        plan: FitnessPlanDto,
        progress: WorkoutProgressMap,
        days: Int = 7,
        today: String = today(),
    ): Int {
        val detected = detectMissedSessions(plan, progress, today, days)
        val dayCount = plan.workoutPlan?.weeklyPlan?.size ?: 0
        val tracked = plan.workoutPlan?.missedSessions.orEmpty().filter {
            it.status == "missed" &&
                // Entries orphaned by a regenerated or shortened plan point at days that no longer
                // exist. Counting them inflates the missed total and triggers a phantom catch-up banner.
                it.planIndex >= 0 && it.planIndex < dayCount &&
                it.scheduledDate >= offsetDate(today, -days) &&
                !isWorkoutSessionComplete(plan, it.planIndex, it.scheduledDate, progress)
        }
        return (detected.map { it.id } + tracked.map { it.id }).toSet().size
    }

    fun shouldShowCatchUpBanner(
        plan: FitnessPlanDto,
        progress: WorkoutProgressMap,
        today: String = today(),
    ): Boolean {
        plan.workoutPlan?.catchUpBannerDismissedAt?.take(10)?.let { if (it == today) return false }
        return countRecentMissed(plan, progress, 7, today) >= 2
    }

    fun applyScheduleAction(
        plan: FitnessPlanDto,
        action: ScheduleAction,
        progress: WorkoutProgressMap,
        today: String = today(),
    ): Pair<FitnessPlanDto, String> {
        var wp = plan.workoutPlan ?: WorkoutPlanSectionDto()
        var missed = wp.missedSessions?.toMutableList() ?: mutableListOf()
        val detected = detectMissedSessions(plan, progress, today)
        val added = mutableListOf<MissedSessionDto>()

        when (action) {
            ScheduleAction.stay_on_week, ScheduleAction.repeat_week -> {
                val weeks = maxOf(1, kotlin.math.ceil(countRecentMissed(plan, progress, 7, today) / 3.0).toInt())
                wp = wp.copy(programWeekOffset = (wp.programWeekOffset ?: 0) + weeks)
                detected.forEach { s ->
                    val entry = s.copy(status = "skipped")
                    added += entry
                    missed = upsertMissed(missed, entry)
                }
            }
            ScheduleAction.skip_week -> {
                detected.forEach { s ->
                    val entry = s.copy(status = "skipped")
                    added += entry
                    missed = upsertMissed(missed, entry)
                }
            }
            ScheduleAction.catch_up -> {
                detected.forEach { s ->
                    added += s
                    missed = upsertMissed(missed, s)
                }
                if (wp.advancementMode == null) wp = wp.copy(advancementMode = "calendar")
            }
        }

        wp = wp.copy(missedSessions = missed, catchUpBannerDismissedAt = null)
        val summary = when (action) {
            ScheduleAction.stay_on_week, ScheduleAction.repeat_week -> "Staying on your current program week."
            ScheduleAction.skip_week -> "Skipped ${added.size} missed session(s)."
            ScheduleAction.catch_up ->
                if (added.isEmpty()) "Catch-up queue is up to date." else "Added ${added.size} session(s) to catch-up."
        }
        return plan.copy(workoutPlan = wp) to summary
    }

    fun dismissCatchUpBanner(plan: FitnessPlanDto, at: String = dismissedAtNow()): FitnessPlanDto {
        val wp = plan.workoutPlan ?: return plan
        return plan.copy(workoutPlan = wp.copy(catchUpBannerDismissedAt = at))
    }

    /** ISO timestamp with a local-date prefix so [shouldShowCatchUpBanner] can compare `take(10)` to [today]. */
    private fun dismissedAtNow(): String {
        val localToday = today()
        val utcTail = java.time.Instant.now().toString().substringAfter('T')
        return "${localToday}T$utcTail"
    }

    fun matchDayToDate(plan: FitnessPlanDto, date: String): Int? =
        runCatching { WorkoutProgramSchedule.planIndexForDate(plan, parse(date)) }.getOrNull()

    fun isWorkoutSessionComplete(
        plan: FitnessPlanDto,
        planIndex: Int,
        date: String,
        progress: WorkoutProgressMap,
    ): Boolean = isWorkoutSessionCompleteInternal(plan, planIndex, date, progress)

    private fun isWorkoutSessionCompleteInternal(
        plan: FitnessPlanDto,
        planIndex: Int,
        date: String,
        progress: WorkoutProgressMap,
    ): Boolean {
        val day = plan.workoutPlan?.weeklyPlan?.getOrNull(planIndex) ?: return false
        val items = allExercises(day)
        if (items.isEmpty()) return false
        val weekStart = WorkoutProgramSchedule.mondayWeekStartStringContaining(date)
        val weekProgress = progressForDate(plan, date, progress)
        return items.count { (exercise, section) ->
            val legacy = exerciseProgressKey(plan.id, day, exercise, section)
            val scoped = WorkoutWebProgress.weekScopedKey(plan.id, weekStart, day.day, section, exercise)
            val ts = weekProgress[legacy] ?: progress[scoped] ?: progress[legacy]
            ts?.take(10) == date
        } >= items.size
    }

    private fun progressForDate(
        plan: FitnessPlanDto,
        date: String,
        progress: WorkoutProgressMap,
    ): Map<String, String> {
        val weekStart = WorkoutProgramSchedule.mondayWeekStartStringContaining(date)
        val filtered = mutableMapOf<String, String>()
        val weekPattern = Regex("^\\d{4}-\\d{2}-\\d{2}$")
        for ((key, ts) in progress) {
            if (ts.isBlank()) continue
            val legacy = legacyLookupKey(key, plan.id) ?: continue
            val parts = key.split(':')
            val isWeekScoped = parts.size > 1 && weekPattern.matches(parts[1])
            when {
                isWeekScoped && parts[1] == weekStart -> filtered[legacy] = ts
                !isWeekScoped && isTimestampInWeek(ts, weekStart) -> filtered[legacy] = ts
            }
        }
        return filtered
    }

    private fun legacyLookupKey(key: String, planId: String): String? {
        val parsed = WorkoutWebProgress.parseKey(key, planId) ?: return null
        return WorkoutWebProgress.legacyKey(planId, parsed.dayLabel, parsed.section, parsed.exercise)
    }

    private fun isTimestampInWeek(isoTimestamp: String, weekStartMonday: String): Boolean {
        val ts = isoTimestamp.take(10)
        val start = runCatching { parse(weekStartMonday) }.getOrNull() ?: return false
        val tsDate = runCatching { parse(ts) }.getOrNull() ?: return false
        val end = start.plusDays(7)
        return !tsDate.isBefore(start) && tsDate.isBefore(end)
    }

    private fun sessionId(planIndex: Int, scheduledDate: String) = "$planIndex:$scheduledDate"

    private fun upsertMissed(list: MutableList<MissedSessionDto>, entry: MissedSessionDto): MutableList<MissedSessionDto> {
        list.removeAll { it.id == entry.id }
        list.add(entry)
        return list
    }

    private fun allExercises(day: WorkoutDayDto): List<Pair<WorkoutExerciseDto, String>> {
        val out = mutableListOf<Pair<WorkoutExerciseDto, String>>()
        day.warmups?.forEach { out += it to "warmup" }
        day.exercises.forEach { out += it to "main" }
        day.finishers?.forEach { out += it to "finisher" }
        return out
    }

    private fun exerciseProgressKey(
        planId: String,
        day: WorkoutDayDto,
        exercise: WorkoutExerciseDto,
        section: String,
    ): String {
        val notes = exercise.notes.orEmpty()
        return if (section == "main") {
            "$planId:${day.day}:${exercise.name}:${exercise.sets}:${exercise.reps}:$notes"
        } else {
            "$planId:${day.day}:$section:${exercise.name}:${exercise.sets}:${exercise.reps}:$notes"
        }
    }
}
