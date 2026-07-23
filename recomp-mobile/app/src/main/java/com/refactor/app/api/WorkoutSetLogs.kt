package com.refactor.app.api

import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.api.dto.WorkoutSetLogDto
import java.time.Instant

/** Mirrors web `workout-set-logs.ts` for synced per-set performance. */
object WorkoutSetLogs {

    fun logId(
        planId: String,
        date: String,
        dayLabel: String,
        section: String,
        exerciseName: String,
        globalSlot: Int,
        setIndex: Int,
    ): String {
        val name = exerciseName.trim().lowercase()
        return "$planId:$date:$dayLabel:$section:$name:$globalSlot:set_$setIndex"
    }

    fun buildLog(
        planId: String,
        date: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExerciseDto,
        globalSlot: Int,
        setIndex: Int,
        weightLbs: Double? = null,
        reps: Int? = null,
        rpe: Double? = null,
    ): WorkoutSetLogDto {
        val id = logId(planId, date, dayLabel, section, exercise.name, globalSlot, setIndex)
        return WorkoutSetLogDto(
            id = id,
            date = date,
            planId = planId,
            dayLabel = dayLabel,
            section = section,
            exerciseName = exercise.name.trim(),
            globalSlot = globalSlot,
            setIndex = setIndex,
            weightLbs = weightLbs,
            reps = reps,
            rpe = rpe,
            prescribedSets = exercise.sets,
            prescribedReps = exercise.reps,
            loggedAt = Instant.now().toString(),
        )
    }

    fun upsert(logs: List<WorkoutSetLogDto>, entry: WorkoutSetLogDto): List<WorkoutSetLogDto> {
        val idx = logs.indexOfFirst { it.id == entry.id }
        if (idx >= 0) {
            return logs.toMutableList().also { it[idx] = entry }
        }
        return logs + entry
    }

    fun remove(logs: List<WorkoutSetLogDto>, id: String): List<WorkoutSetLogDto> =
        logs.filter { it.id != id }

    fun mergeLocalRemote(local: List<WorkoutSetLogDto>, remote: List<WorkoutSetLogDto>): List<WorkoutSetLogDto> {
        val byId = linkedMapOf<String, WorkoutSetLogDto>()
        for (log in remote) byId[log.id] = log
        for (log in local) {
            val existing = byId[log.id]
            if (existing == null || log.loggedAt >= existing.loggedAt) byId[log.id] = log
        }
        return byId.values.sortedBy { it.loggedAt }
    }
}
