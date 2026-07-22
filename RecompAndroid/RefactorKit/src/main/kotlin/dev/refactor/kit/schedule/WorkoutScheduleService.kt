package dev.refactor.kit.schedule

import dev.refactor.kit.models.AdvancementMode
import dev.refactor.kit.models.FitnessPlan
import dev.refactor.kit.models.MissedSession
import dev.refactor.kit.models.MissedSessionStatus
import dev.refactor.kit.models.ScheduleAction
import dev.refactor.kit.models.WorkoutDay
import dev.refactor.kit.models.WorkoutExercise
import dev.refactor.kit.models.WorkoutPlan
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

typealias WorkoutProgressMap = Map<String, String>

object DateHelpers {
    private val fmt: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

    fun today(): String = LocalDate.now().format(fmt)

    fun parse(date: String): LocalDate = LocalDate.parse(date, fmt)

    fun mondayWeekStart(date: String): String {
        val d = parse(date)
        val dow = d.dayOfWeek.value // Mon=1 … Sun=7
        val daysFromMonday = if (dow == 7) 6 else dow - 1
        return d.minusDays(daysFromMonday.toLong()).format(fmt)
    }

    fun mondayWeeksElapsed(anchorMonday: String, otherMonday: String): Int {
        val days = ChronoUnit.DAYS.between(parse(anchorMonday), parse(otherMonday))
        return (days / 7).toInt()
    }

    fun offsetDate(date: String, deltaDays: Int): String =
        parse(date).plusDays(deltaDays.toLong()).format(fmt)
}

object WorkoutProgramSchedule {
    private val weekdayNames = listOf("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
    private val shortNames = listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")

    fun extractProgramWeek(dayLabel: String): Int? =
        Regex("week\\s*(\\d+)", RegexOption.IGNORE_CASE).find(dayLabel)?.groupValues?.get(1)?.toIntOrNull()

    private fun weekdayMatches(planDay: String, dayName: String, shortName: String): Boolean {
        val p = planDay.lowercase().trim()
        return p == dayName || p == shortName || p.startsWith(dayName) || p.startsWith(shortName)
    }

    fun planIndex(plan: FitnessPlan, date: String): Int? {
        val wp = plan.workoutPlan.weeklyPlan
        if (wp.isEmpty()) return null

        val d = DateHelpers.parse(date)
        val dow = d.dayOfWeek.value % 7 // Sun=0 … Sat=6
        val dayName = weekdayNames[dow]
        val shortName = shortNames[dow]

        val anchor = plan.workoutPlan.programWeek1Start
        if (anchor != null && wp.size > 7) {
            val programWeek = WorkoutScheduleService.effectiveProgramWeek(plan, DateHelpers.mondayWeekStart(date))
            if (programWeek >= 1) {
                wp.forEachIndexed { i, day ->
                    val pd = day.day.lowercase()
                    if (!weekdayMatches(pd, dayName, shortName)) return@forEachIndexed
                    if (extractProgramWeek(pd) == programWeek) return i
                }
            }
            return null
        }

        wp.forEachIndexed { i, day ->
            if (weekdayMatches(day.day.lowercase(), dayName, shortName)) return i
        }

        if (!planUsesNamedWeekdays(wp)) {
            val mondayBased = if (dow == 0) 6 else dow - 1
            if (mondayBased < wp.size) return mondayBased
        }
        return null
    }

    private fun planUsesNamedWeekdays(weeklyPlan: List<WorkoutDay>): Boolean =
        weeklyPlan.any { day ->
            val p = day.day.lowercase()
            weekdayNames.any { p.startsWith(it) } || shortNames.any { p.startsWith(it) }
        }
}

object WorkoutScheduleService {

    fun effectiveProgramWeek(plan: FitnessPlan, weekStartMonday: String, today: String = DateHelpers.today()): Int {
        val wp = plan.workoutPlan
        val anchor = wp.programWeek1Start ?: return 1
        if (wp.weeklyPlan.size <= 7) return 1

        wp.pausedUntil?.let { paused ->
            if (weekStartMonday <= paused) {
                val base = DateHelpers.mondayWeeksElapsed(anchor, DateHelpers.mondayWeekStart(paused)) + 1
                return maxOf(1, base - (wp.programWeekOffset ?: 0))
            }
        }

        val elapsed = DateHelpers.mondayWeeksElapsed(anchor, weekStartMonday) + 1
        var week = maxOf(1, elapsed - (wp.programWeekOffset ?: 0))

        if (wp.advancementMode == AdvancementMode.completion) {
            val maxCalendar = elapsed
            while (week < maxCalendar && isProgramWeekFullyComplete(plan, week, emptyMap())) week++
            week = minOf(week, maxCalendar)
        }
        return week
    }

    fun detectMissedSessions(
        plan: FitnessPlan,
        progress: WorkoutProgressMap,
        today: String = DateHelpers.today(),
        lookbackDays: Int = 14,
    ): List<MissedSession> {
        val known = (plan.workoutPlan.missedSessions ?: emptyList()).map { it.id }.toSet()
        val found = mutableListOf<MissedSession>()

        for (i in 1..lookbackDays) {
            val dateStr = DateHelpers.offsetDate(today, -i)
            val planIndex = WorkoutProgramSchedule.planIndex(plan, dateStr) ?: continue
            val id = sessionId(planIndex, dateStr)
            if (known.contains(id)) continue
            if (isWorkoutSessionComplete(plan, planIndex, dateStr, progress)) continue
            val day = plan.workoutPlan.weeklyPlan[planIndex]
            found += MissedSession(
                id = id,
                planIndex = planIndex,
                scheduledDate = dateStr,
                status = MissedSessionStatus.missed,
                dayLabel = day.day,
                focus = day.focus,
            )
        }
        return found
    }

    fun getCatchUpQueue(plan: FitnessPlan): List<MissedSession> =
        (plan.workoutPlan.missedSessions ?: emptyList())
            .filter { it.status == MissedSessionStatus.missed || (it.status == MissedSessionStatus.rescheduled && it.rescheduledTo != null) }
            .sortedBy { it.scheduledDate }

    fun countRecentMissed(plan: FitnessPlan, progress: WorkoutProgressMap, days: Int = 7, today: String = DateHelpers.today()): Int {
        val detected = detectMissedSessions(plan, progress, today, days)
        val tracked = (plan.workoutPlan.missedSessions ?: emptyList()).filter {
            it.status == MissedSessionStatus.missed &&
                it.scheduledDate >= DateHelpers.offsetDate(today, -days) &&
                !isWorkoutSessionComplete(plan, it.planIndex, it.scheduledDate, progress)
        }
        return (detected.map { it.id } + tracked.map { it.id }).toSet().size
    }

    fun shouldShowCatchUpBanner(plan: FitnessPlan, progress: WorkoutProgressMap, today: String = DateHelpers.today()): Boolean {
        plan.workoutPlan.catchUpBannerDismissedAt?.take(10)?.let { if (it == today) return false }
        return countRecentMissed(plan, progress, 7, today) >= 2
    }

    fun applyScheduleAction(
        plan: FitnessPlan,
        action: ScheduleAction,
        progress: WorkoutProgressMap,
        today: String = DateHelpers.today(),
        planIndex: Int? = null,
        scheduledDate: String? = null,
        rescheduledTo: String? = null,
        weeksMissed: Int? = null,
    ): Triple<WorkoutPlan, String, List<MissedSession>> {
        var wp = plan.workoutPlan
        var missed = wp.missedSessions?.toMutableList() ?: mutableListOf()
        val added = mutableListOf<MissedSession>()
        val detected = detectMissedSessions(plan, progress, today)

        when (action) {
            ScheduleAction.stay_on_week, ScheduleAction.repeat_week -> {
                val weeks = weeksMissed ?: maxOf(1, kotlin.math.ceil(countRecentMissed(plan, progress, 7, today) / 3.0).toInt())
                wp = wp.copy(programWeekOffset = (wp.programWeekOffset ?: 0) + weeks)
                detected.forEach { s ->
                    val entry = s.copy(status = MissedSessionStatus.skipped)
                    added += entry
                    missed = upsertMissed(missed, entry)
                }
            }
            ScheduleAction.skip_week -> {
                detected.forEach { s ->
                    val entry = s.copy(status = MissedSessionStatus.skipped)
                    added += entry
                    missed = upsertMissed(missed, entry)
                }
            }
            ScheduleAction.catch_up -> {
                detected.forEach { s ->
                    added += s
                    missed = upsertMissed(missed, s)
                }
                if (wp.advancementMode == null) wp = wp.copy(advancementMode = AdvancementMode.calendar)
            }
            ScheduleAction.skip_today -> {
                val idx = planIndex ?: WorkoutProgramSchedule.planIndex(plan, today)
                if (idx != null) {
                    val entry = makeMissed(plan, idx, today, MissedSessionStatus.skipped)
                    added += entry
                    missed = upsertMissed(missed, entry)
                }
            }
            ScheduleAction.reschedule -> {
                if (planIndex != null && scheduledDate != null && rescheduledTo != null) {
                    val entry = makeMissed(plan, planIndex, scheduledDate, MissedSessionStatus.rescheduled, rescheduledTo)
                    added += entry
                    missed = upsertMissed(missed, entry)
                }
            }
        }

        wp = wp.copy(missedSessions = missed, catchUpBannerDismissedAt = null)
        val summary = when (action) {
            ScheduleAction.stay_on_week, ScheduleAction.repeat_week -> "Staying on your current program week."
            ScheduleAction.skip_week -> "Skipped ${added.size} missed session(s)."
            ScheduleAction.catch_up -> if (added.isEmpty()) "Catch-up queue is up to date." else "Added ${added.size} session(s) to catch-up."
            ScheduleAction.skip_today -> "Skipped today's workout."
            ScheduleAction.reschedule -> "Session rescheduled."
        }
        return Triple(wp, summary, added)
    }

    fun dismissCatchUpBanner(plan: FitnessPlan, at: String = java.time.Instant.now().toString()): FitnessPlan =
        plan.copy(workoutPlan = plan.workoutPlan.copy(catchUpBannerDismissedAt = at))

    fun isWorkoutSessionComplete(plan: FitnessPlan, planIndex: Int, date: String, progress: WorkoutProgressMap): Boolean {
        val day = plan.workoutPlan.weeklyPlan.getOrNull(planIndex) ?: return false
        val items = allExercises(day)
        if (items.isEmpty()) return false
        return items.count { (exercise, section) ->
            val key = exerciseProgressKey(plan.id, day, exercise, section)
            progress[key]?.take(10) == date
        } >= items.size
    }

    private fun isProgramWeekFullyComplete(plan: FitnessPlan, programWeek: Int, progress: WorkoutProgressMap): Boolean {
        val sessions = plan.workoutPlan.weeklyPlan.withIndex().filter { (_, day) ->
            WorkoutProgramSchedule.extractProgramWeek(day.day) == programWeek
        }
        return sessions.isNotEmpty() && sessions.all { (idx, _) ->
            isWorkoutSessionComplete(plan, idx, DateHelpers.today(), progress)
        }
    }

    private fun sessionId(planIndex: Int, scheduledDate: String) = "$planIndex:$scheduledDate"

    private fun upsertMissed(list: MutableList<MissedSession>, entry: MissedSession): MutableList<MissedSession> {
        list.removeAll { it.id == entry.id }
        list.add(entry)
        return list
    }

    private fun makeMissed(
        plan: FitnessPlan,
        planIndex: Int,
        scheduledDate: String,
        status: MissedSessionStatus,
        rescheduledTo: String? = null,
    ): MissedSession {
        val day = plan.workoutPlan.weeklyPlan[planIndex]
        return MissedSession(
            id = sessionId(planIndex, scheduledDate),
            planIndex = planIndex,
            scheduledDate = scheduledDate,
            status = status,
            rescheduledTo = rescheduledTo,
            dayLabel = day.day,
            focus = day.focus,
        )
    }

    private fun allExercises(day: WorkoutDay): List<Pair<WorkoutExercise, String>> {
        val out = mutableListOf<Pair<WorkoutExercise, String>>()
        day.warmups?.forEach { out += it to "warmup" }
        day.exercises.forEach { out += it to "main" }
        day.finishers?.forEach { out += it to "finisher" }
        return out
    }

    fun exerciseProgressKey(planId: String, day: WorkoutDay, exercise: WorkoutExercise, section: String): String {
        val notes = exercise.notes ?: ""
        return if (section == "main") {
            "$planId:${day.day}:${exercise.name}:${exercise.sets}:${exercise.reps}:$notes"
        } else {
            "$planId:${day.day}:$section:${exercise.name}:${exercise.sets}:${exercise.reps}:$notes"
        }
    }
}
