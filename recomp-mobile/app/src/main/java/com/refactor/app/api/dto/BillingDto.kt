package com.refactor.app.api.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PlayPurchaseVerifyRequest(
    val packageName: String,
    @SerialName("subscriptionId") val subscriptionId: String,
    @SerialName("purchaseToken") val purchaseToken: String,
)

@Serializable
data class PlayPurchaseVerifyResponse(
    val ok: Boolean = false,
    val verified: Boolean? = null,
    val message: String? = null,
)
