package com.refactor.app.api

import com.refactor.app.BuildConfig
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.MealSuggestResponseDto
import com.refactor.app.api.dto.NutritionLookupResponseDto
import com.refactor.app.api.dto.RecipeParseResponseDto
import com.refactor.app.api.dto.RecipeSaveResponseDto
import com.refactor.app.api.dto.RecipeSuggestRequestDto
import com.refactor.app.api.dto.RecipeSuggestResponseDto
import com.refactor.app.api.dto.SavedRecipeDto
import com.refactor.app.api.dto.ScoredRecipeSuggestionDto
import com.refactor.app.api.dto.SuggestedMealDto
import com.refactor.app.api.dto.VoiceParseResponseDto
import io.ktor.client.HttpClient
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

class MealRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {

    suspend fun analyzePhoto(imageBytes: ByteArray): Result<List<SuggestedMealDto>> =
        uploadImage("$baseUrl/api/meals/analyze-photo", imageBytes) { raw ->
            normalizePhotoOrReceipt(raw)
        }

    suspend fun analyzeMenu(imageBytes: ByteArray): Result<List<SuggestedMealDto>> =
        uploadImage("$baseUrl/api/meals/analyze-menu", imageBytes) { raw ->
            val root = SyncJson.format.parseToJsonElement(raw).jsonObject
            val items = root["items"]?.jsonArray ?: return@uploadImage emptyList()
            items.mapNotNull { el ->
                val o = el.jsonObject
                val name = o["name"]?.jsonPrimitive?.content ?: return@mapNotNull null
                val macrosObj = o["estimatedMacros"]?.jsonObject
                    ?: o["macros"]?.jsonObject
                val macros = macrosFromJson(macrosObj) ?: macrosFromFlat(o)
                SuggestedMealDto(
                    name = name,
                    description = o["description"]?.jsonPrimitive?.content,
                    macros = macros,
                )
            }
        }

    suspend fun analyzeReceipt(imageBytes: ByteArray): Result<List<SuggestedMealDto>> =
        uploadImage("$baseUrl/api/meals/analyze-receipt", imageBytes) { raw ->
            normalizePhotoOrReceipt(raw, itemsKey = "items")
        }

    suspend fun lookupNutrition(query: String): Result<SuggestedMealDto> = runCatching {
        val response = client.post("$baseUrl/api/meals/lookup-nutrition-web") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("query", query.trim()) })
        }
        response.ensureSuccessOrThrow()
        val body = SyncJson.format.decodeFromString<NutritionLookupResponseDto>(response.bodyAsText())
        val name = body.food ?: body.name ?: query.trim()
        val macros = body.nutrition ?: body.macros
            ?: throw ApiException(422, body.error ?: "No nutrition found")
        SuggestedMealDto(name = name, macros = macros)
    }

    suspend fun parseRecipeUrl(url: String): Result<SuggestedMealDto> = runCatching {
        val response = client.post("$baseUrl/api/meals/parse-recipe-url") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("url", url.trim()) })
        }
        response.ensureSuccessOrThrow()
        val body = SyncJson.format.decodeFromString<RecipeParseResponseDto>(response.bodyAsText())
        SuggestedMealDto(name = body.name, macros = body.macros)
    }

    suspend fun parseVoiceTranscript(transcript: String): Result<List<SuggestedMealDto>> = runCatching {
        val response = client.post("$baseUrl/api/voice/parse") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("transcript", transcript.trim()) })
        }
        response.ensureSuccessOrThrow()
        val body = SyncJson.format.decodeFromString<VoiceParseResponseDto>(response.bodyAsText())
        body.meals?.takeIf { it.isNotEmpty() } ?: run {
            val name = body.name?.trim().orEmpty()
            if (name.isEmpty()) emptyList()
            else listOf(
                SuggestedMealDto(
                    name = name,
                    macros = MealMacrosDto(
                        calories = body.calories ?: 0.0,
                        protein = body.protein ?: 0.0,
                        carbs = body.carbs ?: 0.0,
                        fat = body.fat ?: 0.0,
                    ),
                ),
            )
        }
    }

    suspend fun suggestMeals(
        mealType: String?,
        remainingCalories: Int,
        remainingProtein: Int,
        restrictions: List<String>,
        goal: String,
    ): Result<List<SuggestedMealDto>> = runCatching {
        val response = client.post("$baseUrl/api/meals/suggest") {
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    mealType?.let { put("mealType", it) }
                    put("remainingCalories", remainingCalories)
                    put("remainingProtein", remainingProtein)
                    put("goal", goal)
                    putJsonArray("restrictions") {
                        restrictions.forEach { add(JsonPrimitive(it)) }
                    }
                },
            )
        }
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<MealSuggestResponseDto>(response.bodyAsText()).suggestions
    }

    suspend fun suggestRecipes(request: RecipeSuggestRequestDto): Result<List<ScoredRecipeSuggestionDto>> = runCatching {
        val response = client.post("$baseUrl/api/recipes/suggest") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<RecipeSuggestResponseDto>(response.bodyAsText()).suggestions
    }

    suspend fun saveRecipeFromUrl(url: String): Result<SavedRecipeDto> = runCatching {
        val response = client.post("$baseUrl/api/recipes/save-from-url") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("url", url.trim()) })
        }
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<RecipeSaveResponseDto>(response.bodyAsText()).recipe
    }

    private suspend fun uploadImage(
        url: String,
        imageBytes: ByteArray,
        parse: (String) -> List<SuggestedMealDto>,
    ): Result<List<SuggestedMealDto>> = runCatching {
        val response = client.post(url) {
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append(
                            "image",
                            imageBytes,
                            Headers.build {
                                append(HttpHeaders.ContentType, "image/jpeg")
                                append(HttpHeaders.ContentDisposition, "form-data; name=\"image\"; filename=\"photo.jpg\"")
                            },
                        )
                    },
                ),
            )
        }
        response.ensureSuccessOrThrow()
        parse(response.bodyAsText())
    }

    /** Photo + receipt routes return varying shapes; normalize to [SuggestedMealDto]. */
    private fun normalizePhotoOrReceipt(raw: String, itemsKey: String? = null): List<SuggestedMealDto> {
        val root = SyncJson.format.parseToJsonElement(raw).jsonObject
        val mealsArr = root["meals"]?.jsonArray
        if (mealsArr != null) {
            return mealsArr.mapNotNull { el ->
                val o = el.jsonObject
                val name = o["name"]?.jsonPrimitive?.content ?: return@mapNotNull null
                val macros = macrosFromJson(o["macros"]?.jsonObject) ?: macrosFromFlat(o)
                SuggestedMealDto(
                    name = name,
                    description = o["description"]?.jsonPrimitive?.content,
                    macros = macros,
                    mealType = o["mealType"]?.jsonPrimitive?.content,
                )
            }
        }
        val items = itemsKey?.let { root[it]?.jsonArray }
        if (items != null) {
            return items.mapNotNull { el ->
                val o = el.jsonObject
                val name = o["name"]?.jsonPrimitive?.content ?: return@mapNotNull null
                val macros = macrosFromJson(o["macros"]?.jsonObject) ?: macrosFromFlat(o)
                SuggestedMealDto(name = name, macros = macros)
            }
        }
        val name = root["name"]?.jsonPrimitive?.content ?: return emptyList()
        return listOf(
            SuggestedMealDto(
                name = name,
                macros = macrosFromFlat(root),
            ),
        )
    }

    private fun macrosFromJson(obj: JsonObject?): MealMacrosDto? {
        if (obj == null) return null
        return MealMacrosDto(
            calories = obj["calories"]?.jsonPrimitive?.double ?: obj["calories"]?.jsonPrimitive?.int?.toDouble() ?: 0.0,
            protein = obj["protein"]?.jsonPrimitive?.double ?: obj["protein"]?.jsonPrimitive?.int?.toDouble() ?: 0.0,
            carbs = obj["carbs"]?.jsonPrimitive?.double ?: obj["carbs"]?.jsonPrimitive?.int?.toDouble() ?: 0.0,
            fat = obj["fat"]?.jsonPrimitive?.double ?: obj["fat"]?.jsonPrimitive?.int?.toDouble() ?: 0.0,
        )
    }

    private fun macrosFromFlat(obj: JsonObject): MealMacrosDto = MealMacrosDto(
        calories = obj["calories"]?.jsonPrimitive?.double ?: obj["calories"]?.jsonPrimitive?.int?.toDouble() ?: 0.0,
        protein = obj["protein"]?.jsonPrimitive?.double ?: obj["protein"]?.jsonPrimitive?.int?.toDouble() ?: 0.0,
        carbs = obj["carbs"]?.jsonPrimitive?.double ?: obj["carbs"]?.jsonPrimitive?.int?.toDouble() ?: 0.0,
        fat = obj["fat"]?.jsonPrimitive?.double ?: obj["fat"]?.jsonPrimitive?.int?.toDouble() ?: 0.0,
    )
}
