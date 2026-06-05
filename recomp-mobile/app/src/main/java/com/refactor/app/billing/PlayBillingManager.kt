package com.refactor.app.billing

import android.app.Activity
import android.app.Application
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.refactor.app.BuildConfig
import com.refactor.app.api.BillingRepository
import com.refactor.app.api.dto.PlayPurchaseVerifyRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class PlayBillingUiState(
    val configured: Boolean = BuildConfig.PLAY_SUBSCRIPTION_ID.isNotBlank(),
    val connected: Boolean = false,
    val productTitle: String? = null,
    val activePurchase: Purchase? = null,
    val lastError: String? = null,
    val busy: Boolean = false,
)

/**
 * Google Play Billing for the primary subscription product ([BuildConfig.PLAY_SUBSCRIPTION_ID]).
 * Call [startConnection] when the user session is active; [endConnection] from [Activity.onDestroy].
 */
class PlayBillingManager(
    application: Application,
    private val scope: CoroutineScope,
    private val billingRepository: BillingRepository,
) : PurchasesUpdatedListener {

    private val appContext = application.applicationContext
    private val packageName: String = appContext.packageName

    private val client: BillingClient = BillingClient.newBuilder(appContext)
        .setListener(this)
        .enablePendingPurchases()
        .build()

    private val _state = MutableStateFlow(PlayBillingUiState())
    val state: StateFlow<PlayBillingUiState> = _state.asStateFlow()

    private val subscriptionId: String get() = BuildConfig.PLAY_SUBSCRIPTION_ID.trim()

    fun startConnection() {
        if (subscriptionId.isEmpty()) {
            _state.update { it.copy(configured = false, connected = false, lastError = null) }
            return
        }
        _state.update { it.copy(busy = true, lastError = null) }
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    _state.update { it.copy(connected = true, busy = false) }
                    queryProductDetails()
                    queryExistingPurchases()
                } else {
                    _state.update {
                        it.copy(
                            connected = false,
                            busy = false,
                            lastError = result.debugMessage.ifBlank { "Billing setup failed (${result.responseCode})" },
                        )
                    }
                }
            }

            override fun onBillingServiceDisconnected() {
                _state.update { it.copy(connected = false) }
            }
        })
    }

    fun endConnection() {
        runCatching { if (client.isReady) client.endConnection() }
    }

    private fun queryProductDetails() {
        if (subscriptionId.isEmpty()) return
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(subscriptionId)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        client.queryProductDetailsAsync(params) { billingResult, detailsList ->
            if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                _state.update {
                    it.copy(lastError = billingResult.debugMessage.ifBlank { "Product query failed" })
                }
                return@queryProductDetailsAsync
            }
            val pd = detailsList?.firstOrNull()
            _state.update {
                it.copy(
                    productTitle = pd?.name ?: subscriptionId,
                    lastError = if (pd == null) "No subscription product in Play Console for this id." else null,
                )
            }
        }
    }

    fun queryExistingPurchases() {
        if (!client.isReady) return
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        client.queryPurchasesAsync(params) { billingResult, purchases ->
            if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                _state.update {
                    it.copy(lastError = billingResult.debugMessage.ifBlank { "Could not refresh purchases" })
                }
                return@queryPurchasesAsync
            }
            val active = purchases?.firstOrNull { purchase ->
                purchase.products.contains(subscriptionId) &&
                    purchase.purchaseState == Purchase.PurchaseState.PURCHASED
            }
            _state.update { it.copy(activePurchase = active, lastError = null) }
        }
    }

    fun launchSubscribeFlow(activity: Activity) {
        val sid = subscriptionId
        if (sid.isEmpty() || !client.isReady) return
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(sid)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        client.queryProductDetailsAsync(params) { billingResult, detailsList ->
            if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                _state.update {
                    it.copy(lastError = billingResult.debugMessage.ifBlank { "Could not load product" })
                }
                return@queryProductDetailsAsync
            }
            val pd = detailsList?.firstOrNull()
            if (pd == null) {
                _state.update { it.copy(lastError = "Product not found in Play Console.") }
                return@queryProductDetailsAsync
            }
            val offerToken = pd.subscriptionOfferDetails?.firstOrNull()?.offerToken
            if (offerToken == null) {
                _state.update { it.copy(lastError = "Subscription has no active base plan / offer in Play Console.") }
                return@queryProductDetailsAsync
            }
            val detailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(pd)
                .setOfferToken(offerToken)
                .build()
            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(detailsParams))
                .build()
            val launchResult = client.launchBillingFlow(activity, flowParams)
            if (launchResult.responseCode != BillingClient.BillingResponseCode.OK) {
                _state.update {
                    it.copy(lastError = launchResult.debugMessage.ifBlank { "Could not open purchase UI" })
                }
            }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            return
        }
        if (result.responseCode != BillingClient.BillingResponseCode.OK || purchases.isNullOrEmpty()) {
            _state.update {
                it.copy(lastError = result.debugMessage.ifBlank { "Purchase update failed (${result.responseCode})" })
            }
            return
        }
        for (purchase in purchases) {
            handlePurchase(purchase)
        }
        queryExistingPurchases()
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        if (!purchase.isAcknowledged) {
            val acknowledgeParams = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()
            client.acknowledgePurchase(acknowledgeParams) { ackResult ->
                if (ackResult.responseCode != BillingClient.BillingResponseCode.OK) {
                    _state.update {
                        it.copy(lastError = ackResult.debugMessage.ifBlank { "Acknowledge failed" })
                    }
                } else {
                    notifyServer(purchase)
                }
            }
        } else {
            notifyServer(purchase)
        }
    }

    private fun notifyServer(purchase: Purchase) {
        val token = purchase.purchaseToken
        val sid = purchase.products.firstOrNull() ?: subscriptionId
        if (token.isBlank() || sid.isBlank()) return
        scope.launch {
            withContext(Dispatchers.IO) {
                runCatching {
                    billingRepository.verifyPlaySubscription(
                        PlayPurchaseVerifyRequest(
                            packageName = packageName,
                            subscriptionId = sid,
                            purchaseToken = token,
                        ),
                    ).getOrThrow()
                }
            }
        }
    }
}
