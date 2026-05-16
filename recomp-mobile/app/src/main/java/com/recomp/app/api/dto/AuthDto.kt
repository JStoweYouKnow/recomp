package com.recomp.app.api.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

/**
 * `/api/auth/login` — mirrors Swift `AuthResponse` + extra `success` from Next route.
 */
@Serializable
data class LoginResponse(
    val success: Boolean? = null,
    val authenticated: Boolean? = null,
    val userId: String? = null,
    val profile: UserProfileDto? = null,
)

@Serializable
data class MeResponse(
    val authenticated: Boolean = false,
    val userId: String? = null,
    val profile: UserProfileDto? = null,
)

@Serializable
data class UserProfileDto(
    val id: String,
    val name: String,
    val email: String? = null,
    val age: Int = 0,
    val weight: Double = 0.0,
    val height: Double = 0.0,
    val gender: String = "other",
    val fitnessLevel: String = "intermediate",
    val goal: String = "maintain",
    val dietaryRestrictions: List<String> = emptyList(),
    val injuriesOrLimitations: List<String> = emptyList(),
    val dailyActivityLevel: String? = null,
    val unitSystem: String? = null,
    val workoutEquipment: List<String> = emptyList(),
    val workoutDaysPerWeek: Int? = null,
    val createdAt: String? = null,
    @SerialName("proAccess") val proAccess: Boolean? = null,
)
