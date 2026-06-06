package com.refactor.app.api.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

/**
 * `/api/auth/register` body. Only [name] is required; the server fills defaults for
 * omitted fields. Null fields are dropped from the JSON (`encodeDefaults = false`) so
 * the server's `.optional()` zod schema accepts them (it rejects explicit nulls).
 *
 * Per the server contract, [weight] must be in **lbs** and [height] in **cm**,
 * regardless of [unitSystem] (which only records the user's display preference).
 */
@Serializable
data class RegisterRequest(
    val name: String,
    val email: String? = null,
    val password: String? = null,
    val age: Int? = null,
    val weight: Double? = null,
    val height: Double? = null,
    val gender: String? = null,
    val fitnessLevel: String? = null,
    val goal: String? = null,
    val dietaryRestrictions: List<String>? = null,
    val injuriesOrLimitations: List<String>? = null,
    val dailyActivityLevel: String? = null,
    val unitSystem: String? = null,
    val workoutLocation: String? = null,
    val workoutEquipment: List<String>? = null,
    val workoutDaysPerWeek: Int? = null,
    val workoutTimeframe: String? = null,
)

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ResetPasswordRequest(
    val email: String,
    val code: String,
    val newPassword: String,
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
    /** Bearer token for `Authorization` on subsequent API calls (mobile auth). */
    val apiToken: String? = null,
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
