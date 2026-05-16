package com.recomp.app.api.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GroupMembershipDto(
    val groupId: String,
    val groupName: String,
    val role: String,
    val joinedAt: String,
)

@Serializable
data class GroupDto(
    val id: String,
    val name: String,
    val description: String = "",
    val goalType: String,
    val goalDescription: String? = null,
    val accessMode: String = "open",
    val trackingMode: String = "both",
    val inviteCode: String? = null,
    val creatorId: String = "",
    val memberCount: Int = 0,
    val createdAt: String = "",
)

@Serializable
data class GroupDetailResponseDto(
    val group: GroupDto,
    val members: List<GroupMembershipDto> = emptyList(),
)

@Serializable
data class GroupMessageDto(
    val id: String,
    val authorId: String,
    val authorName: String,
    val authorAvatarUrl: String? = null,
    val text: String,
    val createdAt: String,
    val pinnedAt: String? = null,
)

@Serializable
data class ChallengeParticipantDto(
    val userId: String,
    val name: String,
    val progress: Double = 0.0,
    val score: Double = 0.0,
)

@Serializable
data class ChallengeDto(
    val id: String,
    val type: String = "solo",
    val title: String,
    val description: String = "",
    val metric: String,
    val target: Double,
    val startDate: String,
    val endDate: String,
    val stakes: String? = null,
    val participants: List<ChallengeParticipantDto> = emptyList(),
    val status: String = "pending",
    val createdBy: String = "",
    val groupId: String? = null,
    val myProgress: Double? = null,
    val myScore: Double? = null,
)

@Serializable
data class GroupMemberProgressDto(
    val userId: String,
    val name: String,
    val avatarDataUrl: String? = null,
    val xp: Int = 0,
    val xpLevel: Int = 0,
    val streakLength: Int = 0,
    val weeksActive: Int = 0,
    val macroHitRate: Double = 0.0,
    val updatedAt: String = "",
)

@Serializable
data class ResearchResponseDto(
    val answer: String,
    val sources: List<ResearchSourceDto>? = null,
)

@Serializable
data class ResearchSourceDto(
    val title: String,
    val url: String,
)

@Serializable
data class MealPrepIngredientDto(
    val name: String,
    val amount: String,
    val category: String = "",
)

@Serializable
data class MealPrepRecipeDto(
    val name: String,
    val servings: Int = 1,
    val macrosPerServing: MealMacrosDto = MealMacrosDto(),
    val ingredients: List<MealPrepIngredientDto> = emptyList(),
    val instructions: List<String> = emptyList(),
    val prepTime: Int = 0,
    val cookTime: Int = 0,
)

@Serializable
data class MealPrepGenerateResponseDto(
    val recipes: List<MealPrepRecipeDto> = emptyList(),
    val batchInstructions: List<String> = emptyList(),
    val estimatedPrepTime: Int = 0,
)

@Serializable
data class ExerciseSearchResultDto(
    @SerialName("exerciseId") val id: String,
    val name: String,
    val gifUrl: String? = null,
    val targetMuscles: List<String>? = null,
    val instructions: List<String>? = null,
)

@Serializable
data class RecoveryAssessmentDto(
    val score: Double = 0.0,
    val level: String = "moderate",
    val recommendation: String = "",
)
