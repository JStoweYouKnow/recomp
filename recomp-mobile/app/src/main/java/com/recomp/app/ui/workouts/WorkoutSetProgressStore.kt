package com.recomp.app.ui.workouts

import android.content.Context
import com.recomp.app.api.dto.FitnessPlanDto
import com.recomp.app.api.dto.WorkoutExerciseDto
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Serializable
internal data class WorkoutSetProgressRootWire(
    val byDay: Map<String, Map<String, List<String>>> = emptyMap(),
    val webProgress: Map<String, String>? = null,
)

/**
 * Local per-set checkmarks + web `workoutProgress` map — mirrors iOS `WorkoutService` persistence.
 */
class WorkoutSetProgressStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val byDay: MutableMap<String, MutableMap<String, MutableSet<String>>> = mutableMapOf()
    private var webProgressMap: MutableMap<String, String> = mutableMapOf()

    fun load() {
        val raw = prefs.getString(KEY_DATA, null) ?: return
        runCatching {
            val root = json.decodeFromString<WorkoutSetProgressRootWire>(raw)
            byDay.clear()
            root.byDay.forEach { (day, inner) ->
                val m = mutableMapOf<String, MutableSet<String>>()
                inner.forEach { (k, list) -> m[k] = list.toMutableSet() }
                byDay[day] = m
            }
            webProgressMap = root.webProgress.orEmpty().toMutableMap()
        }
    }

    private fun persist() {
        val wire = WorkoutSetProgressRootWire(
            byDay = byDay.mapValues { (_, inner) ->
                inner.mapValues { (_, set) -> set.sorted() }
            },
            webProgress = webProgressMap.ifEmpty { null },
        )
        prefs.edit().putString(KEY_DATA, json.encodeToString(wire)).apply()
    }

    /** Replace web map from server; merge completions into [byDay] additively (iOS parity). */
    fun replaceFromServer(plan: FitnessPlanDto?, serverWorkoutProgress: Map<String, String>) {
        webProgressMap = serverWorkoutProgress.toMutableMap()
        val pid = plan?.id.orEmpty()
        if (plan == null || pid.isEmpty()) {
            persist()
            return
        }
        for ((key, iso) in serverWorkoutProgress) {
            val parsed = WorkoutWebProgress.parseKey(key, pid) ?: continue
            val loc = WorkoutWebProgress.locateSlot(parsed, plan) ?: continue
            val utcDate = iso.take(10)
            val dayKey = if (parsed.weekStartMonday != null) {
                WorkoutWebProgress.calendarDayKey(parsed.weekStartMonday, parsed.dayLabel, utcDate)
            } else {
                utcDate
            }
            val wp = plan.workoutPlan?.weeklyPlan.orEmpty()
            val (planIdx, gs) = loc
            if (planIdx !in wp.indices) continue
            val day = wp[planIdx]
            val pair = day.enumeratedExerciseSlots().firstOrNull { it.first == gs } ?: continue
            val ex = pair.second
            val n = ex.effectiveSetCount()
            val section = day.sectionForGlobalSlot(gs)
            val sk = WorkoutWebProgress.localRowSetProgressKey(pid, day.day, section, ex, gs)
            val dayMap = byDay.getOrPut(dayKey) { mutableMapOf() }
            val set = dayMap.getOrPut(sk) { mutableSetOf() }
            for (i in 0 until n) set.add("set_$i")
        }
        persist()
    }

    fun rowSetTags(progressDayKey: String, rowStorageKey: String): Set<String> =
        byDay[progressDayKey]?.get(rowStorageKey).orEmpty()

    fun toggleSetTag(
        planId: String,
        progressDayKey: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExerciseDto,
        globalSlot: Int,
        setIndex: Int,
    ) {
        val rowKey = WorkoutWebProgress.localRowSetProgressKey(planId, dayLabel, section, exercise, globalSlot)
        val dayMap = byDay.getOrPut(progressDayKey) { mutableMapOf() }
        val set = dayMap.getOrPut(rowKey) { mutableSetOf() }
        val tag = "set_$setIndex"
        if (set.contains(tag)) set.remove(tag) else set.add(tag)
        if (set.isEmpty()) dayMap.remove(rowKey)
        if (dayMap.isEmpty()) byDay.remove(progressDayKey)

        refreshWebProgressKeys(planId, progressDayKey, dayLabel, section, exercise, globalSlot)
        persist()
    }

    private fun refreshWebProgressKeys(
        planId: String,
        progressDayKey: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExerciseDto,
        globalSlot: Int,
    ) {
        val rowKey = WorkoutWebProgress.localRowSetProgressKey(planId, dayLabel, section, exercise, globalSlot)
        val tags = byDay[progressDayKey]?.get(rowKey).orEmpty()
        val n = exercise.effectiveSetCount()
        val allDone = (0 until n).all { tags.contains("set_$it") }
        val legacy = WorkoutWebProgress.legacyKey(planId, dayLabel, section, exercise)
        val weekMon = WorkoutProgramSchedule.mondayWeekStartStringContaining(progressDayKey)
        val scoped = WorkoutWebProgress.weekScopedKey(planId, weekMon, dayLabel, section, exercise)
        if (allDone) {
            val ts = Instant.now().toString()
            webProgressMap[legacy] = ts
            webProgressMap[scoped] = ts
        } else {
            webProgressMap.remove(legacy)
            webProgressMap.remove(scoped)
        }
    }

    fun mergedForPush(plan: FitnessPlanDto?): Map<String, String> =
        mergeWebWorkoutProgressForSync(plan, webProgressMap, byDay)

    companion object {
        private const val PREFS_NAME = "recomp_workout_set_progress"
        private const val KEY_DATA = "v2"
    }
}

internal fun mergeWebWorkoutProgressForSync(
    plan: FitnessPlanDto?,
    webProgressMap: Map<String, String>,
    byDay: Map<String, Map<String, Set<String>>>,
): Map<String, String> {
    val result = webProgressMap.toMutableMap()
    val pid = plan?.id.orEmpty()
    if (plan == null || pid.isEmpty()) return result

    val wpRoot = plan.workoutPlan?.weeklyPlan.orEmpty()

    for ((dayKey, dayMap) in byDay) {
        val dayDate = runCatching { LocalDate.parse(dayKey) }.getOrNull() ?: continue
        val planIndex = WorkoutProgramSchedule.planIndexForDate(plan, dayDate) ?: continue
        if (planIndex !in wpRoot.indices) continue
        val day = wpRoot[planIndex]
        val completionTs = completionIsoNoonLocal(dayKey)
        for ((globalSlot, ex) in day.enumeratedExerciseSlots()) {
            val section = day.sectionForGlobalSlot(globalSlot)
            val rowKey = WorkoutWebProgress.localRowSetProgressKey(pid, day.day, section, ex, globalSlot)
            val n = ex.effectiveSetCount()
            val allDone = (0 until n).all { i -> dayMap[rowKey]?.contains("set_$i") == true }
            if (!allDone) continue
            val legacy = WorkoutWebProgress.legacyKey(pid, day.day, section, ex)
            val weekMon = WorkoutProgramSchedule.mondayWeekStartStringContaining(dayKey)
            val scoped = WorkoutWebProgress.weekScopedKey(pid, weekMon, day.day, section, ex)
            if (result[legacy] == null) result[legacy] = completionTs
            if (result[scoped] == null) result[scoped] = completionTs
        }
    }
    return result
}

private val noonIsoFormatter: DateTimeFormatter = DateTimeFormatter.ISO_OFFSET_DATE_TIME

private fun completionIsoNoonLocal(dayKey: String): String {
    val d = runCatching { LocalDate.parse(dayKey) }.getOrNull() ?: return Instant.now().toString()
    val z = d.atTime(12, 0, 0).atZone(ZoneId.systemDefault())
    return z.format(noonIsoFormatter)
}
