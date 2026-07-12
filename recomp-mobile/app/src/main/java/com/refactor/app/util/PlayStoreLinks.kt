package com.refactor.app.util

import android.content.Context
import android.content.Intent
import android.net.Uri

object PlayStoreLinks {
    fun openManageSubscriptions(context: Context, packageName: String, subscriptionId: String? = null) {
        val url = if (subscriptionId.isNullOrBlank()) {
            "https://play.google.com/store/account/subscriptions"
        } else {
            "https://play.google.com/store/account/subscriptions?package=$packageName&sku=$subscriptionId"
        }
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }
}
