package com.refactor.app.api

import com.refactor.app.BuildConfig
import com.refactor.app.api.dto.ChallengeDto
import com.refactor.app.api.dto.ExerciseSearchResultDto
import com.refactor.app.api.dto.GroupDetailResponseDto
import com.refactor.app.api.dto.GroupDto
import com.refactor.app.api.dto.GroupMemberProgressDto
import com.refactor.app.api.dto.GroupMembershipDto
import com.refactor.app.api.dto.GroupMessageDto
import com.refactor.app.api.dto.MealPrepGenerateResponseDto
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.ResearchResponseDto
import com.refactor.app.api.dto.BiofeedbackEntryDto
import com.refactor.app.api.dto.MusicSuggestResponseDto
import com.refactor.app.api.dto.RecoveryAssessmentDto
import com.refactor.app.api.dto.WorkoutDayDto
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class GroupRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
    suspend fun listMine(): Result<List<GroupMembershipDto>> = runCatching {
        val r = client.get("$baseUrl/api/groups")
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<List<GroupMembershipDto>>(r.bodyAsText())
    }

    suspend fun discover(): Result<List<GroupDto>> = runCatching {
        val r = client.get("$baseUrl/api/groups/discover")
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<List<GroupDto>>(r.bodyAsText())
    }

    suspend fun create(
        name: String,
        description: String,
        goalType: String,
        goalDescription: String?,
        accessMode: String,
        trackingMode: String,
    ): Result<GroupDto> = runCatching {
        val r = client.post("$baseUrl/api/groups") {
            contentType(ContentType.Application.Json)
            setBody(
                SyncJson.format.encodeToString(
                    CreateGroupBody.serializer(),
                    CreateGroupBody(name, description, goalType, goalDescription, accessMode, trackingMode),
                )
            )
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<GroupDto>(r.bodyAsText())
    }

    suspend fun joinByCode(code: String): Result<Unit> = runCatching {
        val r = client.post("$baseUrl/api/groups/join-by-code") {
            contentType(ContentType.Application.Json)
            setBody(SyncJson.format.encodeToString(JoinCodeBody.serializer(), JoinCodeBody(code.trim())))
        }
        r.ensureSuccessOrThrow()
    }

    suspend fun detail(groupId: String): Result<GroupDetailResponseDto> = runCatching {
        val r = client.get("$baseUrl/api/groups/${groupId.trim()}")
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<GroupDetailResponseDto>(r.bodyAsText())
    }

    suspend fun messages(groupId: String): Result<List<GroupMessageDto>> = runCatching {
        val r = client.get("$baseUrl/api/groups/${groupId.trim()}/messages")
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<List<GroupMessageDto>>(r.bodyAsText())
    }

    suspend fun sendMessage(groupId: String, text: String): Result<Unit> = runCatching {
        val r = client.post("$baseUrl/api/groups/${groupId.trim()}/messages") {
            contentType(ContentType.Application.Json)
            setBody(SyncJson.format.encodeToString(SendGroupMessageBody.serializer(), SendGroupMessageBody(text.trim())))
        }
        r.ensureSuccessOrThrow()
    }

    suspend fun leave(groupId: String): Result<Unit> = runCatching {
        val r = client.post("$baseUrl/api/groups/${groupId.trim()}/leave")
        r.ensureSuccessOrThrow()
    }

    suspend fun leaderboard(groupId: String): Result<List<GroupMemberProgressDto>> = runCatching {
        val r = client.get("$baseUrl/api/groups/${groupId.trim()}/progress")
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<List<GroupMemberProgressDto>>(r.bodyAsText())
    }

    suspend fun listChallenges(): Result<List<ChallengeDto>> = runCatching {
        val r = client.get("$baseUrl/api/challenges")
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<List<ChallengeDto>>(r.bodyAsText())
    }

    suspend fun createChallenge(
        type: String,
        title: String,
        description: String,
        metric: String,
        target: Double,
        startDate: String,
        endDate: String,
        stakes: String?,
        groupId: String?,
        userName: String?,
    ): Result<Unit> = runCatching {
        val r = client.post("$baseUrl/api/challenges/create") {
            contentType(ContentType.Application.Json)
            setBody(
                SyncJson.format.encodeToString(
                    CreateChallengeBody.serializer(),
                    CreateChallengeBody(type, title, description, metric, target, startDate, endDate, stakes, groupId, userName),
                )
            )
        }
        r.ensureSuccessOrThrow()
    }

    suspend fun joinChallenge(challengeId: String, userName: String?): Result<Unit> = runCatching {
        val r = client.post("$baseUrl/api/challenges/join") {
            contentType(ContentType.Application.Json)
            setBody(
                SyncJson.format.encodeToString(
                    JoinChallengeBody.serializer(),
                    JoinChallengeBody(challengeId, userName),
                )
            )
        }
        r.ensureSuccessOrThrow()
    }

    @Serializable
    private data class CreateGroupBody(
        val name: String,
        val description: String,
        val goalType: String,
        val goalDescription: String? = null,
        val accessMode: String,
        val trackingMode: String,
    )

    @Serializable
    private data class JoinCodeBody(val code: String)

    @Serializable
    private data class SendGroupMessageBody(val text: String)

    @Serializable
    private data class CreateChallengeBody(
        val type: String,
        val title: String,
        val description: String,
        val metric: String,
        val target: Double,
        val startDate: String,
        val endDate: String,
        val stakes: String? = null,
        val groupId: String? = null,
        val userName: String? = null,
    )

    @Serializable
    private data class JoinChallengeBody(
        val challengeId: String,
        val userName: String? = null,
    )
}

class ResearchRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
    suspend fun search(query: String): Result<ResearchResponseDto> = runCatching {
        val r = client.get("$baseUrl/api/research") {
            parameter("q", query.trim())
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<ResearchResponseDto>(r.bodyAsText())
    }
}

class MealPrepRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
    suspend fun generate(
        dailyTargets: MealMacrosDto,
        dietaryRestrictions: List<String>,
        pantryItems: List<String>,
        preferences: String?,
    ): Result<MealPrepGenerateResponseDto> = runCatching {
        val r = client.post("$baseUrl/api/meal-prep/generate") {
            contentType(ContentType.Application.Json)
            setBody(
                SyncJson.format.encodeToString(
                    MealPrepGenerateBody.serializer(),
                    MealPrepGenerateBody(dailyTargets, dietaryRestrictions, pantryItems, preferences),
                )
            )
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<MealPrepGenerateResponseDto>(r.bodyAsText())
    }

    @Serializable
    private data class MealPrepGenerateBody(
        val dailyTargets: MealMacrosDto,
        val dietaryRestrictions: List<String> = emptyList(),
        val pantryItems: List<String> = emptyList(),
        val preferences: String? = null,
    )
}

class WorkoutExtrasRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
    suspend fun recoveryAdjust(entry: BiofeedbackEntryDto): Result<RecoveryAssessmentDto> = runCatching {
        val bio = buildJsonObject {
            put("energy", entry.energy)
            put("mood", entry.mood)
            put("hunger", entry.hunger)
            put("stress", entry.stress)
            put("soreness", entry.soreness)
        }
        val body = buildJsonObject { put("biofeedback", bio) }
        val r = client.post("$baseUrl/api/workouts/recovery-adjust") {
            contentType(ContentType.Application.Json)
            setBody(SyncJson.format.encodeToString(JsonObject.serializer(), body))
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<RecoveryAssessmentDto>(r.bodyAsText())
    }

    suspend fun searchExercises(name: String): Result<ExerciseSearchResultDto> = runCatching {
        val r = client.get("$baseUrl/api/exercises/search") {
            parameter("name", name.trim())
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<ExerciseSearchResultDto>(r.bodyAsText())
    }

    suspend fun musicSuggest(workoutFocus: String): Result<MusicSuggestResponseDto> = runCatching {
        val body = buildJsonObject { put("workoutFocus", workoutFocus) }
        val r = client.post("$baseUrl/api/music/suggest") {
            contentType(ContentType.Application.Json)
            setBody(SyncJson.format.encodeToString(JsonObject.serializer(), body))
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<MusicSuggestResponseDto>(r.bodyAsText())
    }

    suspend fun parseWorkoutUrl(url: String): Result<WorkoutDayDto> = runCatching {
        val body = buildJsonObject { put("url", url) }
        val r = client.post("$baseUrl/api/workouts/parse-url") {
            contentType(ContentType.Application.Json)
            setBody(SyncJson.format.encodeToString(JsonObject.serializer(), body))
        }
        r.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<WorkoutDayDto>(r.bodyAsText())
    }
}
