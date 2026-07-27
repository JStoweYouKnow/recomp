package com.refactor.app.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.roundToInt

/**
 * Resolves a scanned/entered barcode to a product name + per-100g macros via the free,
 * public Open Food Facts database. No API key. Mirrors iOS `OpenFoodFactsClient`.
 */
object OpenFoodFactsClient {
    data class Product(
        val name: String,
        val calories: Int,
        val protein: Double,
        val carbs: Double,
        val fat: Double,
    )

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun lookup(barcode: String): Product? = withContext(Dispatchers.IO) {
        val code = barcode.trim()
        if (code.isEmpty()) return@withContext null
        runCatching {
            val url = URL("https://world.openfoodfacts.org/api/v2/product/$code.json?fields=product_name,nutriments")
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
            Product(name, cal, p, c, f)
        }.getOrNull()
    }

    @Serializable
    private data class Resp(val status: Int = 0, val product: OffProduct? = null)

    @Serializable
    private data class OffProduct(
        @SerialName("product_name") val productName: String? = null,
        val nutriments: Nutriments? = null,
    )

    @Serializable
    private data class Nutriments(
        @SerialName("energy-kcal_100g") val energyKcal: Double? = null,
        @SerialName("proteins_100g") val proteins: Double? = null,
        @SerialName("carbohydrates_100g") val carbs: Double? = null,
        @SerialName("fat_100g") val fat: Double? = null,
    )
}
