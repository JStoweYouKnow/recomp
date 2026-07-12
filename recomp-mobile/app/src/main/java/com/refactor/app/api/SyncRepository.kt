package com.refactor.app.api

import com.refactor.app.BuildConfig
import com.refactor.app.api.dto.AdjustDietPlanDto
import com.refactor.app.api.dto.AdjustMacrosDto
import com.refactor.app.api.dto.AdjustMealDto
import com.refactor.app.api.dto.AdjustPayloadDto
import com.refactor.app.api.dto.AdjustPlanDto
import com.refactor.app.api.dto.AdjustResponseDto
import com.refactor.app.api.dto.AdjustSuggestionDto
import com.refactor.app.api.dto.BiofeedbackEntryDto
import com.refactor.app.api.dto.BiofeedbackInsightsPayloadDto
import com.refactor.app.api.dto.BiofeedbackInsightsResponseDto
import com.refactor.app.api.dto.BiofeedbackRowPayloadDto
import com.refactor.app.api.dto.CoachCheckInBioDto
import com.refactor.app.api.dto.CoachCheckInRequestDto
import com.refactor.app.api.dto.CoachCheckInResponseDto
import com.refactor.app.api.dto.FastingSessionDto
import com.refactor.app.api.dto.FitnessPlanDto
import com.refactor.app.api.dto.HydrationEntryDto
import com.refactor.app.api.dto.MacrosCalculatePayloadDto
import com.refactor.app.api.dto.MacrosCalculateResponseDto
import com.refactor.app.api.dto.MealInsightRowDto
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.GenerateWorkoutsProfileDto
import com.refactor.app.api.dto.GenerateWorkoutsRequestDto
import com.refactor.app.api.dto.GenerateWorkoutsResponseDto
import com.refactor.app.api.dto.RegeneratePlanOptions
import com.refactor.app.api.dto.RicoToolActionWire
import com.refactor.app.api.dto.SavedRecipeDto
import com.refactor.app.api.dto.WorkoutDayDto
import com.refactor.app.api.dto.WorkoutPlanSectionDto
import com.refactor.app.ui.workouts.WorkoutImportStart
import com.refactor.app.api.dto.ScheduleAdjustRequestDto
import com.refactor.app.api.dto.ScheduleAdjustResponseDto
import com.refactor.app.api.dto.ScaleEntryPayloadDto
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.api.dto.WearableInsightRowDto
import com.refactor.app.api.dto.WeeklyReviewDto
import com.refactor.app.api.dto.WeeklyReviewPayloadDto
import com.refactor.app.api.dto.WeeklyReviewTargetsDto
import com.refactor.app.api.dto.UserProfileDto
import com.refactor.app.db.CoachMessageDao
import com.refactor.app.db.SyncCacheDao
import com.refactor.app.db.SyncCacheEntity
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

class SyncRepository(
    private val client: HttpClient,
    private val syncCacheDao: SyncCacheDao,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {

    /**
     * Full server snapshot — same contract as iOS `SyncService` pull / web sync GET.
     * Persists **raw JSON** to Room for offline / cross-tab reads (meals list, etc.).
     */
    suspend fun fetchSnapshot(): Result<SyncGetResponse> =
        runCatching {
            val response = client.get("$baseUrl/api/data/sync")
            response.ensureSuccessOrThrow()
            val raw = response.bodyAsText()
            val typed = SyncJson.format.decodeFromString<SyncGetResponse>(raw)
            syncCacheDao.upsert(
                SyncCacheEntity(
                    payloadJson = raw,
                    fetchedAtEpochMillis = System.currentTimeMillis(),
                )
            )
            typed
        }

    /**
     * POST `/api/data/sync` — pushes fields from the cached GET snapshot (flattened `meta`).
     * Matches iOS/web full upsert when echoing server state after pull.
     */
    suspend fun pushCachedSnapshot(): Result<Unit> =
        runCatching {
            val raw = syncCacheDao.getOnce()?.payloadJson
                ?: error("No cached snapshot — refresh sync first.")
            val root = SyncJson.format.parseToJsonElement(raw).jsonObject
            val payload = buildSyncPushPayload(root)
            val response = client.post("$baseUrl/api/data/sync") {
                contentType(ContentType.Application.Json)
                setBody(SyncJson.format.encodeToString(JsonElement.serializer(), payload))
            }
            response.ensureSuccessOrThrow()
        }

    /**
     * Updates the Room snapshot by applying [transform] to the decoded GET payload (iOS parity for local edits).
     * Call [pushCachedSnapshot] afterward so the server receives the change.
     */
    suspend fun mutateCachedSnapshot(transform: (SyncGetResponse) -> SyncGetResponse): Result<Unit> =
        runCatching {
            val entity = syncCacheDao.getOnce() ?: error("No cached snapshot — open Today and refresh first.")
            val snap = SyncJson.format.decodeFromString<SyncGetResponse>(entity.payloadJson)
            val updated = transform(snap)
            val raw = SyncJson.format.encodeToString(SyncGetResponse.serializer(), updated)
            syncCacheDao.upsert(
                SyncCacheEntity(
                    payloadJson = raw,
                    fetchedAtEpochMillis = System.currentTimeMillis(),
                ),
            )
        }

    /** AI-assisted or explicit workout schedule adjustment (web `/api/plans/adjust-schedule` parity). */
    suspend fun adjustWorkoutSchedule(
        useAiRecommendation: Boolean = false,
        action: String? = null,
    ): Result<ScheduleAdjustResponseDto> = runCatching {
        val entity = syncCacheDao.getOnce() ?: error("No cached snapshot — open Today and refresh first.")
        val snap = SyncJson.format.decodeFromString<SyncGetResponse>(entity.payloadJson)
        val plan = snap.plan ?: error("No plan in snapshot")
        val request = ScheduleAdjustRequestDto(
            plan = plan,
            action = action,
            workoutProgress = snap.workoutProgress,
            useAiRecommendation = useAiRecommendation,
            today = LocalDate.now().toString(),
        )
        val response = client.post("$baseUrl/api/plans/adjust-schedule") {
            contentType(ContentType.Application.Json)
            setBody(SyncJson.format.encodeToString(ScheduleAdjustRequestDto.serializer(), request))
        }
        response.ensureSuccessOrThrow()
        val parsed = SyncJson.format.decodeFromString<ScheduleAdjustResponseDto>(response.bodyAsText())
        mutateCachedSnapshot { cached ->
            val p = cached.plan ?: return@mutateCachedSnapshot cached
            cached.copy(plan = p.copy(workoutPlan = parsed.workoutPlan))
        }.getOrThrow()
        pushCachedSnapshot().getOrThrow()
        parsed
    }

    /** Prepends a Rico-saved recipe into the cached snapshot and pushes (parity with web RicoChat). */
    suspend fun mergeSavedRecipeIntoCache(recipe: SavedRecipeDto): Result<Unit> {
        val local = mutateCachedSnapshot { snap ->
            val existing = snap.savedRecipes.orEmpty()
            val deduped = existing.filter {
                (it.recipeUrl ?: "").lowercase() != (recipe.recipeUrl ?: "").lowercase() ||
                    (recipe.recipeUrl ?: "").isEmpty()
            }
            snap.copy(savedRecipes = (listOf(recipe) + deduped).take(500))
        }
        if (local.isFailure) return Result.failure(local.exceptionOrNull()!!)
        return pushCachedSnapshot()
    }

    /**
     * Merges Rico tool actions into the cached GET JSON (iOS/web parity) and persists to Room.
     * @return true if the cache was updated
     */
    suspend fun applyRicoActionsToCache(actions: List<RicoToolActionWire>): Result<Boolean> =
        runCatching {
            if (actions.isEmpty()) return@runCatching false
            val entity = syncCacheDao.getOnce() ?: return@runCatching false
            val root = SyncJson.format.parseToJsonElement(entity.payloadJson).jsonObject
            val merged = RicoSyncActionApplier.apply(root, actions)
            val out = SyncJson.format.encodeToString(JsonElement.serializer(), merged)
            if (out == entity.payloadJson) return@runCatching false
            syncCacheDao.upsert(
                SyncCacheEntity(
                    payloadJson = out,
                    fetchedAtEpochMillis = System.currentTimeMillis(),
                )
            )
            true
        }

    /**
     * Writes [**`meta.ricoHistory`**] from local coach messages (max 100 entries, content capped for sync schema).
     * Call after persisting user + assistant rows so POST flatten includes chat for Dynamo.
     */
    suspend fun mergeCoachHistoryIntoCachedSnapshot(coachMessageDao: CoachMessageDao): Result<Boolean> =
        runCatching {
            val rows = coachMessageDao.listAllAsc()
            if (rows.isEmpty()) return@runCatching false
            val entity = syncCacheDao.getOnce() ?: return@runCatching false
            val root = SyncJson.format.parseToJsonElement(entity.payloadJson).jsonObject
            val historyArr = buildJsonArray {
                rows.takeLast(RICO_HISTORY_MAX).forEach { r ->
                    val role = when (r.role) {
                        "user" -> "user"
                        else -> "assistant"
                    }
                    add(
                        buildJsonObject {
                            put("role", JsonPrimitive(role))
                            put("content", JsonPrimitive(r.content.take(RICO_CONTENT_MAX)))
                            put("at", JsonPrimitive(r.createdAtEpochMillis.toString()))
                        },
                    )
                }
            }
            val meta = root["meta"]?.jsonObject ?: buildJsonObject {}
            val newMeta = buildJsonObject {
                meta.entries.forEach { (k, v) ->
                    if (k != "ricoHistory") put(k, v)
                }
                put("ricoHistory", historyArr)
            }
            val newRoot = buildJsonObject {
                root.entries.forEach { (k, v) ->
                    if (k != "meta") put(k, v)
                }
                put("meta", newMeta)
            }
            val out = SyncJson.format.encodeToString(JsonElement.serializer(), newRoot)
            if (out == entity.payloadJson) return@runCatching false
            syncCacheDao.upsert(
                SyncCacheEntity(
                    payloadJson = out,
                    fetchedAtEpochMillis = System.currentTimeMillis(),
                ),
            )
            true
        }

    /**
     * POST `/api/plans/adjust` — sends feedback + current plan (from cache) and returns an AI suggestion.
     * Mirrors iOS `PlanService.adjustPlan`.
     */
    suspend fun adjustPlan(feedback: String): Result<AdjustSuggestionDto> = runCatching {
        val snap = syncCacheDao.getOnce()?.payloadJson?.let {
            SyncJson.format.decodeFromString<SyncGetResponse>(it)
        }
        val planDto = snap?.plan?.let { fp ->
            AdjustPlanDto(
                id = fp.id,
                userId = fp.userId,
                createdAt = fp.createdAt,
                dietPlan = AdjustDietPlanDto(
                    dailyTargets = fp.dietPlan?.dailyTargets.toAdjustMacros(),
                    trainingTargets = fp.dietPlan?.trainingTargets?.toAdjustMacros(),
                    restTargets = fp.dietPlan?.restTargets?.toAdjustMacros(),
                ),
            )
        }
        val meals = snap?.meals?.map { m ->
            AdjustMealDto(
                date = m.date,
                name = m.name,
                mealType = m.mealType,
                calories = m.macros.calories,
                protein = m.macros.protein,
                carbs = m.macros.carbs,
                fat = m.macros.fat,
            )
        } ?: emptyList()
        val avgCal = meals.takeIf { it.isNotEmpty() }
            ?.sumOf { it.calories }?.div(7.0)
        val avgPro = meals.takeIf { it.isNotEmpty() }
            ?.sumOf { it.protein }?.div(7.0)

        val body = SyncJson.format.encodeToString(
            AdjustPayloadDto.serializer(),
            AdjustPayloadDto(
                feedback = feedback,
                plan = planDto,
                mealsThisWeek = meals,
                avgDailyCalories = avgCal,
                avgDailyProtein = avgPro,
            ),
        )
        val response = client.post("$baseUrl/api/plans/adjust") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<AdjustResponseDto>(response.bodyAsText()).suggestion
    }

    /** Saves macro targets into the cached plan and persists to Room. Call [pushCachedSnapshot] afterward to sync server. */
    suspend fun saveMacroTargets(
        base: MealMacrosDto,
        training: MealMacrosDto? = null,
        rest: MealMacrosDto? = null,
    ): Result<Unit> = mutateCachedSnapshot { snap ->
        val updatedPlan = snap.plan?.let { fp ->
            fp.copy(
                dietPlan = fp.dietPlan?.copy(
                    dailyTargets = base,
                    trainingTargets = training,
                    restTargets = rest,
                ),
            )
        }
        snap.copy(plan = updatedPlan)
    }

    /**
     * POST `/api/macros/calculate` with the adaptive-TDEE estimate, then saves the recalculated
     * targets (base + ±200 kcal / ±50g carb training/rest split) into the cached plan and pushes.
     * Mirrors web `MetabolicModelCard` "Apply to macro targets" and iOS `applyLearnedTDEEToTargets`.
     */
    suspend fun applyTdeeToMacroTargets(estimatedTdee: Int): Result<MealMacrosDto> = runCatching {
        val snap = syncCacheDao.getOnce()?.payloadJson?.let {
            SyncJson.format.decodeFromString<SyncGetResponse>(it)
        } ?: error("No cached snapshot — refresh sync first.")
        if (snap.plan?.dietPlan == null) error("Generate a plan first.")
        val profile = snap.profile
        val body = SyncJson.format.encodeToString(
            MacrosCalculatePayloadDto.serializer(),
            MacrosCalculatePayloadDto(
                weightKg = profile.weight.takeIf { it > 0 }?.div(2.2046),
                heightCm = profile.height.takeIf { it > 0 },
                age = profile.age.takeIf { it > 0 },
                gender = profile.gender,
                dailyActivityLevel = profile.dailyActivityLevel,
                goal = profile.goal,
                learnedTDEE = estimatedTdee.toDouble().coerceIn(1200.0, 5000.0),
            ),
        )
        val response = client.post("$baseUrl/api/macros/calculate") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        response.ensureSuccessOrThrow()
        val macros = SyncJson.format
            .decodeFromString<MacrosCalculateResponseDto>(response.bodyAsText())
            .macros
        val training = MealMacrosDto(
            calories = macros.calories + 200,
            protein = macros.protein,
            carbs = macros.carbs + 50,
            fat = macros.fat,
        )
        val rest = MealMacrosDto(
            calories = maxOf(0.0, macros.calories - 200),
            protein = macros.protein,
            carbs = maxOf(0.0, macros.carbs - 50),
            fat = macros.fat,
        )
        saveMacroTargets(macros, training, rest).getOrThrow()
        pushCachedSnapshot().getOrThrow()
        macros
    }

    /**
     * POST `/api/plans/generate` (+ chunked `/api/plans/generate-workouts` for multi-week programs).
     */
    suspend fun regeneratePlan(options: RegeneratePlanOptions = RegeneratePlanOptions()): Result<FitnessPlanDto> =
        runCatching {
            val snap = syncCacheDao.getOnce()?.payloadJson?.let {
                SyncJson.format.decodeFromString<SyncGetResponse>(it)
            } ?: error("No cached snapshot — pull sync first.")

            val totalWeeks = (options.programWeeks ?: 1).coerceIn(1, 12)
            val daysPerWeek = (options.workoutDaysPerWeek ?: snap.profile.workoutDaysPerWeek ?: 4).coerceIn(2, 7)

            val week1Body = buildPlanGenerateRequestBody(snap, totalWeeks, daysPerWeek)
            val week1Response = client.post("$baseUrl/api/plans/generate") {
                contentType(ContentType.Application.Json)
                setBody(week1Body)
            }
            week1Response.ensureSuccessOrThrow()
            var plan = SyncJson.format.decodeFromString<FitnessPlanDto>(week1Response.bodyAsText())

            if (totalWeeks > 1) {
                val template = extractWeek1TrainingTemplate(plan.workoutPlan?.weeklyPlan.orEmpty())
                if (template.isEmpty()) error("Week 1 has no training days to extend.")
                val profile = snap.profile
                val profileSlice = GenerateWorkoutsProfileDto(
                    name = profile.name,
                    goal = profile.goal,
                    fitnessLevel = profile.fitnessLevel,
                    workoutLocation = profile.workoutLocation,
                    workoutEquipment = profile.workoutEquipment,
                    injuriesOrLimitations = profile.injuriesOrLimitations,
                    workoutDaysPerWeek = daysPerWeek,
                )
                for ((fromWeek, toWeek) in chunkWeekRanges(totalWeeks)) {
                    val chunkBody = SyncJson.format.encodeToString(
                        GenerateWorkoutsRequestDto.serializer(),
                        GenerateWorkoutsRequestDto(
                            fromWeek = fromWeek,
                            toWeek = toWeek,
                            programWeeks = totalWeeks,
                            workoutDaysPerWeek = daysPerWeek,
                            week1Template = template,
                            reason = options.reason,
                            profile = profileSlice,
                        ),
                    )
                    val chunkResponse = client.post("$baseUrl/api/plans/generate-workouts") {
                        contentType(ContentType.Application.Json)
                        setBody(chunkBody)
                    }
                    chunkResponse.ensureSuccessOrThrow()
                    val chunk = SyncJson.format.decodeFromString<GenerateWorkoutsResponseDto>(chunkResponse.bodyAsText())
                    if (chunk.error != null) error(chunk.error)
                    val mergedDays = plan.workoutPlan?.weeklyPlan.orEmpty() + chunk.workoutDays
                    val wp = plan.workoutPlan ?: com.refactor.app.api.dto.WorkoutPlanSectionDto()
                    plan = plan.copy(workoutPlan = wp.copy(weeklyPlan = mergedDays))
                    mutateCachedSnapshot { cached -> cached.copy(plan = plan) }.getOrThrow()
                }
            }

            if (totalWeeks > 1) {
                val days = plan.workoutPlan?.weeklyPlan.orEmpty()
                val anchor = WorkoutImportStart.inferProgramWeek1Start(days)
                val wp = plan.workoutPlan ?: WorkoutPlanSectionDto()
                plan = plan.copy(workoutPlan = wp.copy(programWeek1Start = anchor))
            }

            mutateCachedSnapshot { cached -> cached.copy(plan = plan) }.getOrThrow()
            pushCachedSnapshot().getOrThrow()
            plan
        }

    private fun extractWeek1TrainingTemplate(days: List<WorkoutDayDto>): List<WorkoutDayDto> =
        days.filter { day ->
            val focus = day.focus.lowercase()
            val isRecovery =
                "recovery" in focus || "mobility" in focus || "rest" in focus || "off day" in focus
            day.exercises.isNotEmpty() && !isRecovery
        }

    private fun chunkWeekRanges(totalWeeks: Int, chunkSize: Int = 2): List<Pair<Int, Int>> {
        val ranges = mutableListOf<Pair<Int, Int>>()
        var from = 2
        while (from <= totalWeeks) {
            val to = minOf(from + chunkSize - 1, totalWeeks)
            ranges.add(from to to)
            from = to + 1
        }
        return ranges
    }

    private fun buildPlanGenerateRequestBody(
        snap: SyncGetResponse,
        programWeeks: Int? = null,
        workoutDaysPerWeek: Int? = null,
    ): String {
        val profile = snap.profile.copy(
            workoutDaysPerWeek = workoutDaysPerWeek ?: snap.profile.workoutDaysPerWeek,
        )
        val base = SyncJson.format.encodeToJsonElement(UserProfileDto.serializer(), profile).jsonObject
        val enriched = buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            programWeeks?.takeIf { it > 1 }?.let { put("programWeeks", JsonPrimitive(it)) }
            snap.metabolicModel?.takeIf { it.confidence >= 70 }?.estimatedTDEE?.let { tdee ->
                put("learnedTDEE", JsonPrimitive(tdee.toDouble()))
            }
            snap.meta?.measurementTargets?.let { mt ->
                put(
                    "measurementTargets",
                    SyncJson.format.encodeToJsonElement(
                        com.refactor.app.api.dto.MeasurementTargetsDto.serializer(),
                        mt,
                    ),
                )
            }
        }
        return SyncJson.format.encodeToString(JsonElement.serializer(), enriched)
    }

    /** POST /api/biofeedback/insights — builds payload from cached biofeedback + meals + wearables. */
    suspend fun biofeedbackInsights(): Result<BiofeedbackInsightsResponseDto> = runCatching {
        val snap = syncCacheDao.getOnce()?.payloadJson?.let {
            SyncJson.format.decodeFromString<SyncGetResponse>(it)
        }
        val bf = snap?.biofeedback.orEmpty().map { e ->
            BiofeedbackRowPayloadDto(e.date, e.time, e.energy, e.mood, e.hunger, e.stress, e.soreness)
        }
        val meals = snap?.meals.orEmpty().map { m ->
            MealInsightRowDto(m.date, m.name, m.macros.calories, m.macros.protein, m.macros.carbs, m.macros.fat)
        }
        val wear = snap?.wearableData.orEmpty().map { w ->
            WearableInsightRowDto(w.date, w.provider, w.steps, w.caloriesBurned, w.sleepScore)
        }
        val body = SyncJson.format.encodeToString(
            BiofeedbackInsightsPayloadDto.serializer(),
            BiofeedbackInsightsPayloadDto(bf, meals, wear),
        )
        val r = client.post("$baseUrl/api/biofeedback/insights") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<BiofeedbackInsightsResponseDto>(r.bodyAsText())
    }

    /** POST /api/agent/weekly-review — builds payload from cached meals, wearables, and profile. */
    suspend fun weeklyReview(): Result<WeeklyReviewDto> = runCatching {
        val snap = syncCacheDao.getOnce()?.payloadJson?.let {
            SyncJson.format.decodeFromString<SyncGetResponse>(it)
        }
        val meals = snap?.meals.orEmpty().map { m ->
            MealInsightRowDto(m.date, m.name, m.macros.calories, m.macros.protein, m.macros.carbs, m.macros.fat)
        }
        val wear = snap?.wearableData.orEmpty().map { w ->
            WearableInsightRowDto(w.date, w.provider, w.steps, w.caloriesBurned, w.sleepScore)
        }
        val dailyTargets = snap?.plan?.dietPlan?.dailyTargets
        val targets = if (dailyTargets != null) WeeklyReviewTargetsDto(
            calories = dailyTargets.calories.toInt(),
            protein = dailyTargets.protein,
            carbs = dailyTargets.carbs,
            fat = dailyTargets.fat,
        ) else null
        val goal = snap?.profile?.goal ?: "maintain"
        val userName = snap?.profile?.name?.split(" ")?.firstOrNull() ?: "Athlete"
        val body = SyncJson.format.encodeToString(
            WeeklyReviewPayloadDto.serializer(),
            WeeklyReviewPayloadDto(meals, wear, targets, goal, userName),
        )
        val r = client.post("$baseUrl/api/agent/weekly-review") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<WeeklyReviewDto>(r.bodyAsText())
    }

    /** POST /api/wearables/scale/entry — logs a manual scale reading and refreshes cache. */
    suspend fun scaleEntry(payload: ScaleEntryPayloadDto): Result<Unit> = runCatching {
        val body = SyncJson.format.encodeToString(ScaleEntryPayloadDto.serializer(), payload)
        val r = client.post("$baseUrl/api/wearables/scale/entry") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        r.ensureSuccessOrThrow()
        fetchSnapshot().getOrThrow()
    }

    /** Appends a hydration entry to the cached snapshot and pushes to server. */
    suspend fun addHydrationEntry(amountMl: Double): Result<Unit> = runCatching {
        val today = LocalDate.now().toString()
        val now = Instant.now().toString()
        mutateCachedSnapshot { snap ->
            val entry = HydrationEntryDto(
                id = UUID.randomUUID().toString(),
                date = today,
                time = now,
                amountMl = amountMl,
            )
            snap.copy(hydration = snap.hydration.orEmpty() + entry)
        }.getOrThrow()
        pushCachedSnapshot().getOrThrow()
    }

    /** Removes the most recent hydration entry for today with matching ml (or just the latest). */
    suspend fun removeLatestHydration(amountMl: Double? = null): Result<Unit> = runCatching {
        val today = LocalDate.now().toString()
        mutateCachedSnapshot { snap ->
            val list = snap.hydration.orEmpty().toMutableList()
            val idx = if (amountMl != null) {
                list.indexOfLast { it.date == today && it.amountMl == amountMl }
                    .takeIf { it >= 0 } ?: list.indexOfLast { it.date == today }
            } else {
                list.indexOfLast { it.date == today }
            }
            if (idx >= 0) list.removeAt(idx)
            snap.copy(hydration = list)
        }.getOrThrow()
        pushCachedSnapshot().getOrThrow()
    }

    /** Starts a new fasting session and pushes to server. No-op if a session is already active. */
    suspend fun startFast(protocol: String = "16:8", targetHours: Double = 16.0): Result<Unit> = runCatching {
        mutateCachedSnapshot { snap ->
            val hasActive = snap.fastingSessions.orEmpty().any { it.endTime.isNullOrBlank() }
            if (hasActive) return@mutateCachedSnapshot snap
            val session = FastingSessionDto(
                id = UUID.randomUUID().toString(),
                startTime = Instant.now().toString(),
                endTime = null,
                targetHours = targetHours,
                protocol = protocol,
            )
            snap.copy(fastingSessions = snap.fastingSessions.orEmpty() + session)
        }.getOrThrow()
        pushCachedSnapshot().getOrThrow()
    }

    /** Ends the active fasting session by setting its endTime and pushes to server. */
    suspend fun endActiveFast(): Result<Unit> = runCatching {
        val now = Instant.now().toString()
        mutateCachedSnapshot { snap ->
            val updated = snap.fastingSessions.orEmpty().map { s ->
                if (s.endTime.isNullOrBlank()) s.copy(endTime = now) else s
            }
            snap.copy(fastingSessions = updated)
        }.getOrThrow()
        pushCachedSnapshot().getOrThrow()
    }

    /** Appends a biofeedback entry for today and pushes to server. */
    suspend fun logBiofeedback(energy: Int, mood: Int, hunger: Int, stress: Int, soreness: Int): Result<Unit> = runCatching {
        val today = LocalDate.now().toString()
        val now = Instant.now().toString()
        mutateCachedSnapshot { snap ->
            val entry = BiofeedbackEntryDto(
                id = UUID.randomUUID().toString(),
                date = today,
                time = now,
                energy = energy,
                mood = mood,
                hunger = hunger,
                stress = stress,
                soreness = soreness,
            )
            snap.copy(biofeedback = snap.biofeedback.orEmpty() + entry)
        }.getOrThrow()
        pushCachedSnapshot().getOrThrow()
    }

    /** POST /api/coach/check-in — builds payload from cached data and returns a personalized nudge. */
    suspend fun coachCheckIn(): Result<CoachCheckInResponseDto> = runCatching {
        val snap = syncCacheDao.getOnce()?.payloadJson?.let {
            SyncJson.format.decodeFromString<SyncGetResponse>(it)
        }
        val today = LocalDate.now().toString()
        val todayMeals = snap?.meals.orEmpty().count { it.date == today }
        val targets = snap?.plan?.dietPlan?.dailyTargets
        val todayTargetsDto = AdjustMacrosDto(
            calories = targets?.calories?.toInt() ?: 0,
            protein = targets?.protein ?: 0.0,
            carbs = targets?.carbs ?: 0.0,
            fat = targets?.fat ?: 0.0,
        )
        val streak = mealLoggingStreak(snap?.meals.orEmpty())
        val bio = snap?.biofeedback.orEmpty().filter { it.date == today }.maxByOrNull { it.time }?.let {
            CoachCheckInBioDto(it.energy, it.mood, it.hunger, it.stress, it.soreness)
        }
        val name = snap?.profile?.name?.split(" ")?.firstOrNull() ?: "Athlete"
        val payload = CoachCheckInRequestDto(
            name = name,
            todayMeals = todayMeals,
            todayTargets = todayTargetsDto,
            streak = streak,
            biofeedback = bio,
        )
        val body = SyncJson.format.encodeToString(CoachCheckInRequestDto.serializer(), payload)
        val r = client.post("$baseUrl/api/coach/check-in") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<CoachCheckInResponseDto>(r.bodyAsText())
    }

    companion object {
        private const val RICO_HISTORY_MAX = 100
        private const val RICO_CONTENT_MAX = 10_000
    }
}

private fun mealLoggingStreak(meals: List<com.refactor.app.api.dto.MealEntryDto>): Int {
    if (meals.isEmpty()) return 0
    val dates = meals.map { it.date }.toSortedSet().toList().reversed()
    var streak = 0
    var cursor = LocalDate.now()
    for (dateStr in dates) {
        val d = runCatching { LocalDate.parse(dateStr) }.getOrNull() ?: break
        if (d == cursor || (streak == 0 && d == cursor)) {
            streak++
            cursor = cursor.minusDays(1)
        } else break
    }
    return streak
}

private fun com.refactor.app.api.dto.MealMacrosDto?.toAdjustMacros(): AdjustMacrosDto =
    if (this == null) AdjustMacrosDto()
    else AdjustMacrosDto(
        calories = calories.toInt(),
        protein = protein,
        carbs = carbs,
        fat = fat,
    )
