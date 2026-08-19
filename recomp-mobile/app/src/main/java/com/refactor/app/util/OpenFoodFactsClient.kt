package com.refactor.app.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonElement
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.roundToInt

/**
 * Resolves a scanned/entered barcode to a product name + macros via the free, public
 * Open Food Facts database. No API key. Mirrors iOS `OpenFoodFactsClient`.
 */
object OpenFoodFactsClient {

    /** A portion the user can pick instead of doing per-100g arithmetic at the shelf. */
    data class Portion(
        /** e.g. "1 serving (30 g)", "100 g", "Whole package (250 g)". */
        val label: String,
        val calories: Int,
        val protein: Double,
        val carbs: Double,
        val fat: Double,
    )

    data class Product(
        val name: String,
        val calories: Int,
        val protein: Double,
        val carbs: Double,
        val fat: Double,
        /** Grams in one manufacturer serving, when the product declares one. */
        val servingSizeGrams: Double? = null,
        /** Serving text straight from the label, e.g. "30 g (about 12 chips)". */
        val servingSizeText: String? = null,
        /** Grams in the whole package, when declared. */
        val packageGrams: Double? = null,
    ) {
        /**
         * Selectable portions, best-first. The declared serving leads because that is how
         * people think about food; per-100g stays available for scale users.
         */
        val portions: List<Portion>
            get() = buildList {
                servingSizeGrams?.takeIf { it > 0 }?.let { grams ->
                    val detail = servingSizeText?.let { " — $it" }.orEmpty()
                    add(scaled("1 serving (${gramsLabel(grams)})$detail", grams))
                }
                add(Portion("100 g", calories, protein, carbs, fat))
                packageGrams?.takeIf { it > 0 && it != servingSizeGrams }?.let { pkg ->
                    add(scaled("Whole package (${gramsLabel(pkg)})", pkg))
                }
            }

        /** The portion to preselect — the label's own serving when it has one. */
        val defaultPortion: Portion? get() = portions.firstOrNull()

        private fun scaled(label: String, grams: Double): Portion {
            val factor = grams / 100.0
            return Portion(
                label = label,
                calories = (calories * factor).roundToInt(),
                protein = Math.round(protein * factor * 10.0) / 10.0,
                carbs = Math.round(carbs * factor * 10.0) / 10.0,
                fat = Math.round(fat * factor * 10.0) / 10.0,
            )
        }

        private fun gramsLabel(grams: Double): String =
            if (grams % 1.0 == 0.0) "${grams.toInt()} g" else String.format("%.1f g", grams)
    }

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun lookup(barcode: String): Product? = withContext(Dispatchers.IO) {
        val code = barcode.trim()
        if (code.isEmpty()) return@withContext null
        runCatching {
            val fields = "product_name,nutriments,serving_size,serving_quantity,product_quantity"
            val url = URL("https://world.openfoodfacts.org/api/v2/product/$code.json?fields=$fields")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("User-Agent", "Recomp-Android - fitness app")
                connectTimeout = 10_000
                readTimeout = 10_000
            }
            if (conn.responseCode != 200) return@runCatching null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val resp = json.decodeFromString<Resp>(body)
            val product = resp.product?.takeIf { resp.status == 1 } ?: return@runCatching null
            val n = product.nutriments
            val cal = (n?.energyKcal ?: 0.0).roundToInt()
            val p = n?.proteins ?: 0.0
            val c = n?.carbs ?: 0.0
            val f = n?.fat ?: 0.0
            if (cal <= 0 && p <= 0.0 && c <= 0.0 && f <= 0.0) return@runCatching null
            val name = product.productName?.trim().orEmpty().ifEmpty { "Scanned item" }
            Product(
                name = name,
                calories = cal,
                protein = p,
                carbs = c,
                fat = f,
                servingSizeGrams = product.servingQuantity.asDouble(),
                servingSizeText = product.servingSize?.trim()?.ifBlank { null },
                packageGrams = product.productQuantity.asDouble(),
            )
        }.getOrNull()
    }

    /**
     * Open Food Facts is inconsistent about these fields — sometimes a JSON number,
     * sometimes a quoted string — so they are read as raw elements and coerced.
     */
    private fun JsonElement?.asDouble(): Double? =
        (this as? JsonPrimitive)?.let { it.content.trim().toDoubleOrNull() }

    @Serializable
    private data class Resp(val status: Int = 0, val product: OffProduct? = null)

    @Serializable
    private data class OffProduct(
        @SerialName("product_name") val productName: String? = null,
        val nutriments: Nutriments? = null,
        @SerialName("serving_size") val servingSize: String? = null,
        @SerialName("serving_quantity") val servingQuantity: JsonElement? = null,
        @SerialName("product_quantity") val productQuantity: JsonElement? = null,
    )

    @Serializable
    private data class Nutriments(
        @SerialName("energy-kcal_100g") val energyKcal: Double? = null,
        @SerialName("proteins_100g") val proteins: Double? = null,
        @SerialName("carbohydrates_100g") val carbs: Double? = null,
        @SerialName("fat_100g") val fat: Double? = null,
    )
}
